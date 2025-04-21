#!/usr/bin/env python3
import paramiko
import socket
import threading
import sys
import traceback
import time

DEBUG = True  # Set to False in production
RETRY_COUNT = 3
RETRY_DELAY = 1  # seconds

def dprint(*args, **kwargs):
    if DEBUG:
        print("[DEBUG]", *args, **kwargs)

# Mapping from SSH username to target container's hostname/IP and port.
USER_CONTAINER_MAP = {
    "student5": ("hosting-users-dind-5", 22),
    "student7": ("hosting-users-dind-7", 22),
    "student8": ("hosting-users-dind-8", 22),
    "student9": ("hosting-users-dind-9", 22),
    "student10": ("hosting-users-dind-10", 22),
}

HOST = "0.0.0.0"
PORT = 2222

# Generate an ephemeral RSA host key.
server_host_key = paramiko.RSAKey.generate(2048)

def open_session_with_retry(transport, retries=RETRY_COUNT, delay=RETRY_DELAY):
    for attempt in range(retries):
        try:
            return transport.open_session()
        except paramiko.ssh_exception.ChannelException as e:
            dprint(f"open_session failed (attempt {attempt+1}/{retries}):", e)
            time.sleep(delay)
    raise paramiko.ssh_exception.ChannelException(2, 'Connect failed after retries')

def forward(src, dst):
    """Blocking read from src and send to dst until EOF."""
    try:
        while True:
            data = src.recv(4096)
            if not data:
                break
            dst.sendall(data)
    except Exception as e:
        dprint("Forward error:", e)

def bridge_channels(chan1, chan2):
    """Bridge two channels using two threads (one per direction)."""
    t1 = threading.Thread(target=forward, args=(chan1, chan2), daemon=True)
    t2 = threading.Thread(target=forward, args=(chan2, chan1), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    try:
        chan1.close()
    except Exception:
        pass
    try:
        chan2.close()
    except Exception:
        pass

def proxy_direct_tcpip_channel(client_channel, target_transport):
    """
    For dynamic (direct-tcpip) channels, first try to open a Paramiko channel.
    If that fails (ChannelException), fall back to opening a raw socket connection
    to the target and bridging the data.
    """
    try:
        origin = getattr(client_channel, "origin_addr", ("", 0))
        dest = getattr(client_channel, "dest_addr", None)
        if dest is None:
            dprint("No dest_addr found; closing dynamic channel.")
            client_channel.close()
            return
        dprint(f"Dynamic channel: forwarding from {origin} to {dest}")
        try:
            # First attempt using Paramiko's channel.
            target_channel = target_transport.open_channel("direct-tcpip", dest, origin)
            dprint("Opened Paramiko direct-tcpip channel.")
            bridge_channels(client_channel, target_channel)
        except paramiko.ssh_exception.ChannelException as e:
            dprint("Paramiko channel failed:", e, "; falling back to raw socket.")
            # Fall back to raw socket connection.
            try:
                raw_sock = socket.create_connection(dest)
            except Exception as e:
                dprint("Raw socket connection failed:", e)
                client_channel.close()
                return
            # Bridge the client channel and raw socket.
            t1 = threading.Thread(target=forward, args=(client_channel, raw_sock), daemon=True)
            t2 = threading.Thread(target=forward, args=(raw_sock, client_channel), daemon=True)
            t1.start()
            t2.start()
            t1.join()
            t2.join()
            try:
                client_channel.close()
            except Exception:
                pass
            try:
                raw_sock.close()
            except Exception:
                pass
    except Exception:
        traceback.print_exc()

class SSHServer(paramiko.ServerInterface):
    """
    Minimal SSH server that accepts shell, exec, SFTP, and dynamic (direct-tcpip) channels.
    """
    def __init__(self):
        self.event = threading.Event()
        self.username = None

    def check_auth_password(self, username, password):
        if username in USER_CONTAINER_MAP:
            self.username = username
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED

    def check_channel_request(self, kind, chanid):
        # Allow only "session" channels. Dynamic channels will use dedicated callbacks.
        if kind == "session":
            return paramiko.OPEN_SUCCEEDED
        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

    def check_channel_direct_tcpip_request(self, chanid, origin, dest):
        return paramiko.OPEN_SUCCEEDED

    def check_channel_forwarded_tcpip_request(self, chanid, origin, dest):
        return paramiko.OPEN_SUCCEEDED

    def check_channel_pty_request(self, channel, term, width, height, pixelwidth, pixelheight, modes):
        channel.pty_info = {
            "term": term,
            "width": width,
            "height": height,
            "pixelwidth": pixelwidth,
            "pixelheight": pixelheight,
            "modes": modes,
        }
        if not hasattr(channel, "request_type"):
            channel.request_type = "shell"
        return True

    def check_channel_shell_request(self, channel):
        channel.request_type = "shell"
        return True

    def check_channel_subsystem_request(self, channel, name):
        if name == "sftp":
            channel.request_type = "sftp"
            return True
        return False

    def check_channel_exec_request(self, channel, command):
        channel.request_type = "exec"
        channel.exec_command = command
        return True

    def check_channel_env_request(self, channel, name, value):
        dprint("Env request:", name, "=", value)
        return True

    def check_channel_auth_agent_request(self, channel):
        return True

    def check_channel_window_change_request(self, channel, width, height, pixelwidth, pixelheight):
        if hasattr(channel, "target_channel"):
            try:
                channel.target_channel.resize_pty(width=width, height=height)
            except Exception as e:
                dprint("Error resizing target pty:", e)
        return True

def proxy_channel(client_channel, target_transport):
    if hasattr(client_channel, "dest_addr"):
        proxy_direct_tcpip_channel(client_channel, target_transport)
        return
    try:
        target_channel = open_session_with_retry(target_transport)
        client_channel.target_channel = target_channel
        req_type = getattr(client_channel, "request_type", "shell")
        dprint("Session channel type:", req_type)
        if req_type == "sftp":
            target_channel.invoke_subsystem("sftp")
        elif req_type == "exec":
            command = getattr(client_channel, "exec_command", "")
            dprint("Exec command on target:", command)
            target_channel.exec_command(command)
        else:
            pty_info = getattr(client_channel, "pty_info", None)
            if pty_info:
                target_channel.get_pty(term=pty_info["term"],
                                       width=pty_info["width"],
                                       height=pty_info["height"])
            else:
                target_channel.get_pty(term="xterm-256color", width=80, height=24)
            target_channel.invoke_shell()
        bridge_channels(client_channel, target_channel)
    except Exception:
        traceback.print_exc()

def proxy_connection(client_transport, target_transport):
    while True:
        try:
            client_channel = client_transport.accept(timeout=1)
            if client_channel is None:
                if not client_transport.is_active():
                    break
                continue
            threading.Thread(target=proxy_channel,
                             args=(client_channel, target_transport),
                             daemon=True).start()
        except Exception:
            traceback.print_exc()
            break

def handle_connection(client_sock, addr):
    try:
        dprint("Connection from", addr)
        client_transport = paramiko.Transport(client_sock)
        client_transport.add_server_key(server_host_key)
        client_transport.set_keepalive(30)
        server = SSHServer()
        try:
            client_transport.start_server(server=server)
        except Exception as e:
            dprint("SSH negotiation failed:", e)
            return
        first_channel = client_transport.accept(timeout=20)
        if first_channel is None:
            dprint("No channel opened by client.")
            client_transport.close()
            return
        if not server.username:
            try:
                first_channel.send("No username provided.\n".encode())
            except Exception:
                pass
            first_channel.close()
            client_transport.close()
            return
        dprint("Routing SSH for user", server.username)
        target_host, target_port = USER_CONTAINER_MAP[server.username]
        target_ssh = paramiko.SSHClient()
        target_ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        target_ssh.connect(target_host, port=target_port, username="admin", password="admin")
        target_transport = target_ssh.get_transport()
        target_transport.set_keepalive(30)
        threading.Thread(target=proxy_channel, args=(first_channel, target_transport), daemon=True).start()
        proxy_connection(client_transport, target_transport)
        client_transport.close()
        target_transport.close()
        target_ssh.close()
    except Exception as e:
        dprint("Exception handling connection from", addr, ":", e)
        traceback.print_exc()
    finally:
        client_sock.close()

def main():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((HOST, PORT))
        sock.listen(100)
        dprint("SSH Router started on", f"{HOST}:{PORT}")
    except Exception as e:
        dprint("Failed to bind on", f"{HOST}:{PORT}", ":", e)
        sys.exit(1)
    while True:
        try:
            client_sock, addr = sock.accept()
            threading.Thread(target=handle_connection, args=(client_sock, addr), daemon=True).start()
        except KeyboardInterrupt:
            dprint("Server shutting down.")
            break
        except Exception as e:
            dprint("Error accepting connection:", e)

if __name__ == "__main__":
    main()
