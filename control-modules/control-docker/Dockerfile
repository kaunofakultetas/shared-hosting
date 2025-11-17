FROM python:3.13.1-alpine

WORKDIR /app

RUN apk add --update docker openrc zip


RUN pip install --no-cache-dir              \
    "Flask==3.0.0"                          \
    "Flask-CORS==4.0.0"                     \
    "docker==7.1.0"

    
COPY . .


EXPOSE 8000
CMD ["python3", "-u", "main.py", "--http"]
