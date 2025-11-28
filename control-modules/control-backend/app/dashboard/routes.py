############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-28
# Version:          1.0
# Description:      Dashboard routes
############################################################

from flask import Blueprint, jsonify
from datetime import datetime
import requests
import os
import json

from ..database.db import get_db_connection
from ..auth.user import admin_required
from .registry_monitor import get_rate_limit



dashboard_bp = Blueprint('dashboard', __name__)

CADVISOR_HOST = os.getenv('CADVISOR_HOST', 'hosting-control-cadvisor')
CADVISOR_PORT = os.getenv('CADVISOR_PORT', '8080')



@dashboard_bp.route('/api/dashboard/system', methods=['GET'])
@admin_required
def dashboard_system_HTTPGET():
    try:
        # Fetch machine info and container stats from cAdvisor
        machine_resp = requests.get(f'http://{CADVISOR_HOST}:{CADVISOR_PORT}/api/v1.3/machine', timeout=5)
        containers_resp = requests.get(f'http://{CADVISOR_HOST}:{CADVISOR_PORT}/api/v1.3/containers', timeout=5)
        
        if machine_resp.status_code != 200 or containers_resp.status_code != 200:
            return jsonify({'message': 'Failed to fetch cAdvisor data'}), 500
        
        machine_info = machine_resp.json()
        root_stats = containers_resp.json().get('stats', [])
        
        if len(root_stats) < 1:
            return jsonify({'message': 'No stats data available yet', 'cpu_percent': 0, 'memory_percent': 0, 'disk_percent': 0}), 503
        
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
                'percent': dockerhub_pull_limits['percent']
            }




        # Convert to GB
        GB = 1024 ** 3
        
        return jsonify({
            'cpu_percent': round(cpu_percent, 1),
            'memory_percent': round(memory_percent, 1),
            'disk_percent': round(disk_percent, 1),
            'cpu_cores': machine_info.get('num_cores', 0),
            'memory_total_gb': round(memory_total / GB, 2),
            'memory_used_gb': round(memory_used / GB, 2),
            'disk_total_gb': round(disk_total / GB, 2),
            'disk_used_gb': round(disk_used / GB, 2),
            'dockerhub_pull_limits': dockerhub_pull_limits,
        }), 200
    
    except requests.exceptions.Timeout:
        return jsonify({'message': 'cAdvisor request timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'message': f'Failed to connect to cAdvisor: {str(e)}'}), 500
    except (KeyError, IndexError, ValueError) as e:
        return jsonify({'message': f'Failed to parse cAdvisor data: {str(e)}'}), 500






@dashboard_bp.route('/api/dashboard/recentactivity', methods=['GET'])
@admin_required
def dashboard_recentactivity_HTTPGET():
    try:
        with get_db_connection() as conn:
            sqlFetchData = conn.execute('''
                WITH GetRecentActivity AS (
                    SELECT
                        System_RecentActivity.ID,
                        System_Users.Email AS UserEmail,
                        System_RecentActivity.Message,
                        System_RecentActivity.Time
                    FROM System_RecentActivity
                    LEFT JOIN System_Users
                        ON System_Users.ID = System_RecentActivity.UserID
                    ORDER BY System_RecentActivity.ID DESC
                    LIMIT 5
                )

                SELECT 
                    json_group_array(
                        json_object(
                            'log_id', ID,
                            'email', UserEmail,
                            'message', Message,
                            'time', Time
                        )
                    )
                FROM GetRecentActivity
            ''')
            recent_activity = sqlFetchData.fetchone()[0]
            recent_activity = json.loads(recent_activity)
        return jsonify(recent_activity), 200
    except Exception as e:
        return jsonify({'message': f'Failed to get recent activity: {str(e)}'}), 500




@dashboard_bp.route('/api/dashboard/hostingsystem', methods=['GET'])
@admin_required
def dashboard_hostingsystem_HTTPGET():
    try:
        with get_db_connection() as conn:
            sqlFetchData = conn.execute('''
                SELECT json_object(
                    'users', (SELECT COUNT(*) FROM System_Users),
                    'virtualservers_running', (SELECT COUNT(*) FROM Hosting_VirtualServers WHERE Deleted = 0 AND ID <> 0 AND Enabled = 1),
                    'virtualservers_total', (SELECT COUNT(*) FROM Hosting_VirtualServers WHERE Deleted = 0 AND ID <> 0),
                    'domains', (SELECT COUNT(*) FROM Hosting_DomainNames)
                ) AS HostingSystemJSON
            ''')
            hosting_system = sqlFetchData.fetchone()[0]
            hosting_system = json.loads(hosting_system)
        return jsonify(hosting_system), 200
    except Exception as e:
        return jsonify({'message': f'Failed to get hosting system information: {str(e)}'}), 500
