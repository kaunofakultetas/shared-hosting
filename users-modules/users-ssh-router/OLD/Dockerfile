FROM python:3.13.2

# Set working directory
WORKDIR /app

# Install necessary system packages
RUN apt-get update && apt-get install -y \
    openssh-server \
    && rm -rf /var/lib/apt/lists/*


RUN pip install --no-cache-dir      \
    paramiko                        \
    docker                          \
    asyncssh                        \
    twisted[conch] service_identity

    
# Copy the SSH proxy script
COPY main.py ./

# Expose the SSH proxy port
EXPOSE 2222

# Run the SSH proxy server
CMD ["python", "-u", "main.py"]
