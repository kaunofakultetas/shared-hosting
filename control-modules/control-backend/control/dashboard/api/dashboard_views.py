############################################################
#  [*] Dashboard views — the admin home's three widgets
#
#  Admin-only, polled every 2 seconds by the dashboard:
#  host metrics computed from cAdvisor samples, the global
#  activity feed and the platform totals. Response shapes
#  are load-bearing — the widgets poll every 2 seconds and
#  render these keys verbatim.
#
#  Used by:
#    - SystemOverviewWidget — /api/dashboard/system
#    - RecentActivityWidget — /api/dashboard/recentactivity
#    - HostingSystemWidget  — /api/dashboard/hostingsystem
############################################################

import logging
import os
from datetime import datetime

import requests
from django.http import JsonResponse

from control.common.auth import admin_required, format_datetime
from control.dashboard.registry_monitor import get_rate_limit
from control.hosting.models import DomainName, VirtualServer
from control.users.models import RecentActivity, SystemUser


logger = logging.getLogger(__name__)

CADVISOR_HOST = os.getenv('CADVISOR_HOST', 'hosting-control-cadvisor')
CADVISOR_PORT = os.getenv('CADVISOR_PORT', '8080')








############################################################
# dashboard_system
############################################################
#
# GET /api/dashboard/system — CPU (delta of cAdvisor's last
# two samples), memory working-set, the largest real
# filesystem, and the Docker Hub pull budget (60 s cache in
# registry_monitor).
#
# Used by:
#   - SystemOverviewWidget — 2 s poll
############################################################

@admin_required
def dashboard_system(request):
    try:
        # Fetch machine info and container stats from cAdvisor
        machine_resp = requests.get(f'http://{CADVISOR_HOST}:{CADVISOR_PORT}/api/v1.3/machine', timeout=5)
        containers_resp = requests.get(f'http://{CADVISOR_HOST}:{CADVISOR_PORT}/api/v1.3/containers', timeout=5)

        if machine_resp.status_code != 200 or containers_resp.status_code != 200:
            return JsonResponse({'message': 'Failed to fetch cAdvisor data'}, status=500)

        machine_info = machine_resp.json()
        root_stats = containers_resp.json().get('stats', [])

        if len(root_stats) < 1:
            return JsonResponse({'message': 'No stats data available yet', 'cpu_percent': 0, 'memory_percent': 0, 'disk_percent': 0}, status=503)

        latest = root_stats[-1]

        # CPU calculation (requires 2 data points)
        cpu_percent = 0
        if len(root_stats) >= 2:
            previous = root_stats[-2]
            cpu_delta = latest['cpu']['usage']['total'] - previous['cpu']['usage']['total']
            latest_time = datetime.fromisoformat(latest['timestamp'].replace('Z', '+00:00'))
            previous_time = datetime.fromisoformat(previous['timestamp'].replace('Z', '+00:00'))
            time_delta = (latest_time - previous_time).total_seconds() * 1e9
            num_cores = machine_info['num_cores']
            cpu_percent = (cpu_delta / time_delta / num_cores) * 100.0 if time_delta > 0 and num_cores > 0 else 0

        # Memory calculation
        memory_used = latest['memory']['working_set']
        memory_total = machine_info['memory_capacity']
        memory_percent = (memory_used / memory_total) * 100.0 if memory_total > 0 else 0

        # Disk calculation - find largest real filesystem
        disk_used = disk_total = 0

        if 'filesystems' in machine_info:
            for fs_info in machine_info['filesystems']:
                capacity = fs_info.get('capacity', 0)
                if capacity > disk_total:
                    disk_total = capacity
                    device = fs_info.get('device', '')
                    if 'filesystem' in latest:
                        for fs_stat in latest['filesystem']:
                            if fs_stat.get('device') == device:
                                disk_used = fs_stat.get('usage', 0)
                                break

        # Fallback: find largest filesystem from stats
        if disk_total == 0 and 'filesystem' in latest:
            for fs in latest['filesystem']:
                capacity = fs.get('capacity', 0)
                device = fs.get('device', '')
                if capacity > disk_total and capacity > 1e9:  # > 1GB
                    if not device.startswith(('/dev/loop', 'tmpfs', 'devtmpfs', 'overlay')):
                        disk_total = capacity
                        disk_used = fs.get('usage', 0)

        disk_percent = (disk_used / disk_total) * 100.0 if disk_total > 0 else 0


        # DockerHub pull limits
        dockerhub_pull_limits = get_rate_limit()
        if dockerhub_pull_limits:
            dockerhub_pull_limits = {
                'limit': dockerhub_pull_limits['limit'],
                'remaining': dockerhub_pull_limits['remaining'],
                'used': dockerhub_pull_limits['used'],
                'percent': dockerhub_pull_limits['percent'],
            }


        # Convert to GB
        GB = 1024 ** 3

        return JsonResponse({
            'cpu_percent': round(cpu_percent, 1),
            'memory_percent': round(memory_percent, 1),
            'disk_percent': round(disk_percent, 1),
            'cpu_cores': machine_info.get('num_cores', 0),
            'memory_total_gb': round(memory_total / GB, 2),
            'memory_used_gb': round(memory_used / GB, 2),
            'disk_total_gb': round(disk_total / GB, 2),
            'disk_used_gb': round(disk_used / GB, 2),
            'dockerhub_pull_limits': dockerhub_pull_limits,
        }, status=200)

    except requests.exceptions.Timeout:
        return JsonResponse({'message': 'cAdvisor request timeout'}, status=504)
    except requests.exceptions.RequestException as e:
        logger.exception('Failed to connect to cAdvisor')
        return JsonResponse({'message': 'Failed to connect to cAdvisor'}, status=500)
    except (KeyError, IndexError, ValueError) as e:
        logger.exception('Failed to parse cAdvisor data')
        return JsonResponse({'message': 'Failed to parse cAdvisor data'}, status=500)








############################################################
# dashboard_recentactivity
############################################################
#
# GET /api/dashboard/recentactivity — the newest 5 activity
# rows across ALL users; deleted authors show as
# "Deleted User".
#
# Used by:
#   - RecentActivityWidget — 2 s poll
############################################################

@admin_required
def dashboard_recentactivity(request):
    try:
        recent_activity = [
            {
                'log_id': thisRow.id,
                'email': thisRow.user.email if thisRow.user else 'Deleted User',
                'message': thisRow.message,
                'time': format_datetime(thisRow.created_at),
            }
            for thisRow in RecentActivity.objects.select_related('user').order_by('-id')[:5]
        ]
        return JsonResponse(recent_activity, safe=False, status=200)
    except Exception as e:
        logger.exception('Failed to get recent activity')
        return JsonResponse({'message': 'Failed to get recent activity'}, status=500)








############################################################
# dashboard_hostingsystem
############################################################
#
# GET /api/dashboard/hostingsystem — the platform totals.
# VM counts exclude the reserved HOST row (ID 0) and
# soft-deleted servers.
#
# Used by:
#   - HostingSystemWidget — 2 s poll
############################################################

@admin_required
def dashboard_hostingsystem(request):
    try:
        hosting_system = {
            'users': SystemUser.objects.count(),
            'virtualservers_running': VirtualServer.objects.filter(deleted=False, enabled=True).exclude(id=0).count(),
            'virtualservers_total': VirtualServer.objects.filter(deleted=False).exclude(id=0).count(),
            'domains': DomainName.objects.count(),
        }
        return JsonResponse(hosting_system, status=200)
    except Exception as e:
        logger.exception('Failed to get hosting system information')
        return JsonResponse({'message': 'Failed to get hosting system information'}, status=500)
