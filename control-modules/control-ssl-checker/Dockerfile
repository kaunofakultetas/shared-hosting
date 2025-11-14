FROM python:3.12.5-alpine

WORKDIR /app

RUN pip install --no-cache-dir py-zabbix==1.1.7

COPY ./main.py /app

USER 1000
CMD ["python3", "-u", "main.py"]
