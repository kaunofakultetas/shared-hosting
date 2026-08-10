FROM python:3.13-slim

WORKDIR /app


RUN pip install --no-cache-dir              \
    "Django==5.2.15"                        \
    "django-environ==0.13.0"                \
    "bcrypt==4.2.1"                         \
    "requests==2.32.3"                      \
    "gunicorn==26.0.0"


COPY . .


EXPOSE 8000
CMD sh -c "\
    python3 manage.py bootstrap_db && \
    { \
        (while true; do \
            python3 -u manage.py monitor_containers; \
            echo 'Monitor exited - restarting in 3 s'; \
            sleep 3; \
        done) & \
        if echo \"$APP_DEBUG $DJANGO_DEBUG\" | grep -qi true; then \
            python3 manage.py runserver 0.0.0.0:8000; \
        else \
            exec gunicorn control.wsgi:application --bind 0.0.0.0:8000 --workers 5 --timeout 360 --access-logfile /logs/access.log; \
        fi; \
    }"
