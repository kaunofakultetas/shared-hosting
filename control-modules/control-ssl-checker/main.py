import ssl
import socket
import os
from datetime import datetime, timezone
from pyzabbix import ZabbixMetric, ZabbixSender
from time import sleep



# SSL Certificate Expiry Check Function
def get_ssl_expiry_days(hostname):
    context = ssl.create_default_context()
    with socket.create_connection((hostname, 443)) as sock:
        with context.wrap_socket(sock, server_hostname=hostname) as ssock:
            cert = ssock.getpeercert()
    expiry_date_str = cert['notAfter']
    expiry_date = datetime.strptime(expiry_date_str, '%b %d %H:%M:%S %Y %Z').replace(tzinfo=timezone.utc)
    current_date = datetime.now(timezone.utc)
    days_until_expiry = (expiry_date - current_date).days
    return days_until_expiry




def main():
    # Data destination (Zabbix server):
    zabbixServer = ZabbixSender(os.getenv('ZABBIX_HOST'), int(os.getenv('ZABBIX_PORT', 10051)) )

    # SSL Certificate Expiry Check
    check_hosts = os.getenv('CHECK_HOSTS')
    if not check_hosts:
        print("No hosts found in CHECK_HOSTS environment variable.")
        return
    
    hosts = check_hosts.split(',')
    min_days_until_expiry = 10000

    for hostname in hosts:
        hostname = hostname.strip()
        if hostname:
            try:
                days = get_ssl_expiry_days(hostname)
                print(f"The SSL certificate for {hostname} is valid for {days} more days.")
                if days < min_days_until_expiry:
                    min_days_until_expiry = days
            except Exception as e:
                print(f"Failed to check SSL certificate for {hostname}: {e}")

    # Send the minimum days until expiry to Zabbix
    if min_days_until_expiry < 10000:
        try:
            zabbixPacket = [ZabbixMetric(os.getenv('ZABBIX_TRAPPER_HOST'), os.getenv('ZABBIX_TRAPPER_KEY'), min_days_until_expiry)]
            zabbixServer.send(zabbixPacket)
            print(f"Sent minimum SSL expiry days ({min_days_until_expiry}) to Zabbix.")
        except Exception as e:
            print(f"Failed to send SSL expiry data to Zabbix: {e}")
    else:
        print(f"Failed to get at least 1 ssl expiry time.")





if __name__ == "__main__":
    sleep(15)
    while True:
        main()
        sleep(600)


