FROM python:3.13.1-alpine

WORKDIR /app


RUN pip install --no-cache-dir              \
    "Flask==3.0.0"                          \
    "Flask-Login==0.6.3"                    \
    "Flask-RESTful==0.3.10"                 \
    "Flask-CORS==4.0.0"                     \
    "bcrypt==4.1.2"                         \
    "requests==2.32.3"


EXPOSE 8000
CMD ["python3", "-u", "main.py", "--http"]
