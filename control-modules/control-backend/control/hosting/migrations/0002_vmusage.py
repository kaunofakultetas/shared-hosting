############################################################
#  [*] VmUsage — per-VM resource telemetry table
#
#  One nullable-everything OneToOne beside the VM registry:
#  CPU/RAM written every monitor pass, disk every ~5 minutes.
############################################################

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hosting', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='VmUsage',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cpu_percent', models.FloatField(blank=True, null=True)),
                ('memory_mb', models.IntegerField(blank=True, null=True)),
                ('disk_mb', models.IntegerField(blank=True, null=True)),
                ('cpu_measured_at', models.DateTimeField(blank=True, null=True)),
                ('disk_measured_at', models.DateTimeField(blank=True, null=True)),
                ('virtual_server', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='usage', to='hosting.virtualserver')),
            ],
        ),
    ]
