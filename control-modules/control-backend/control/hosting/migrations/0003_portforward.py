############################################################
#  [*] PortForward — public TCP port forwards table
#
#  One row per forwarded port: a globally unique public_port
#  (the pool bounds are enforced by the views, not the
#  database), the VM-side target port and a free-text label.
############################################################

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hosting', '0002_vmusage'),
    ]

    operations = [
        migrations.CreateModel(
            name='PortForward',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_port', models.IntegerField(unique=True)),
                ('internal_port', models.IntegerField()),
                ('description', models.CharField(default='', max_length=100)),
                ('virtual_server', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='port_forwards', to='hosting.virtualserver')),
            ],
        ),
    ]
