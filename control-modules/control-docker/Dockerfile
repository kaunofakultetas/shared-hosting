FROM python:3.13.1-alpine

WORKDIR /app

RUN apk add --update docker-cli


RUN pip install --no-cache-dir              \
    "Flask==3.0.0"                          \
    "requests==2.32.3"                      \
    "requests-unixsocket==0.4.1"

    
COPY . .


EXPOSE 8000
CMD ["python3", "-u", "main.py", "--http"]
