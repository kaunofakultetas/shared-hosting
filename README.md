# Shared Hosting Platform
This repository contains the setup and deployment of shared hosting platform which gives users disposable linux environments. In these linux environments users can run and install apps and/or run docker containers. This is made possible by using Sysbox docker runtime with which users get to control docker container in which they can run inner docker containers (Docker-In-Docker).

## Security
- ***Unprivileged Containers:*** Using Sysbox docker runtime there is no need to compromise security while running Docker-In-Docker. Sysbox runtime allows unprivileged docker containers run docker inside them.
- ***Secured Local Subnets:*** Outgoing network traffic is filtered and does not allow access to local networks
  
## Screenshots
Main screen showing running virtual servers (outer user docker containers):
<img width="1440" alt="Screenshot 2025-04-22 at 00 29 18" src="https://github.com/user-attachments/assets/78a80a1f-383e-4ead-8018-f6a9fee00ba6" />

User virtual server control panel:
<img width="1437" alt="Screenshot 2025-04-22 at 00 31 40" src="https://github.com/user-attachments/assets/b6fcb8d5-36f4-47bb-a538-6b554b511095" />

Command line interface via WEB browser using WebSSH2:
<img width="713" alt="Screenshot 2025-04-22 at 00 32 04" src="https://github.com/user-attachments/assets/9b5c344a-e396-4490-b31c-919160638984" />

## Overall Structure
Virtualization structure is as follows:
![WleK9e69BXea4HyM-drawing-3-1745271878](https://github.com/user-attachments/assets/7769de4b-2e85-461e-ba10-1bf63732e5fc)


## Installation
Instructions comming soon...


