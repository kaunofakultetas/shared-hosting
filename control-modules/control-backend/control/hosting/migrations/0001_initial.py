############################################################
#  [*] Hosting initial migration — fresh, constrained schema
#
#  Runs on a brand-new SQLite file (no legacy adoption).
#  Django-default table names; real FK constraints, including
#  the (docker_id, parent_server) uniqueness of the cache.
############################################################

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='VirtualServer',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='', max_length=255)),
                ('enabled', models.BooleanField(default=True)),
                ('deleted', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='virtual_servers', to='users.systemuser')),
            ],
        ),
        migrations.CreateModel(
            name='DomainName',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('domain_name', models.CharField(max_length=255, unique=True)),
                ('is_cloudflare', models.BooleanField(default=False)),
                ('ssl', models.BooleanField(default=False)),
                ('virtual_server', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='domains', to='hosting.virtualserver')),
            ],
        ),
        migrations.CreateModel(
            name='DockerContainer',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('docker_id', models.CharField(max_length=255)),
                ('command', models.TextField()),
                ('created_at', models.TextField()),
                ('image', models.TextField()),
                ('labels', models.TextField()),
                ('mounts', models.TextField()),
                ('names', models.TextField()),
                ('networks', models.TextField()),
                ('ports', models.TextField()),
                ('running_for', models.TextField()),
                ('size', models.TextField()),
                ('state', models.TextField()),
                ('status', models.TextField()),
                ('synced_at', models.DateTimeField()),
                ('parent_server', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='containers', to='hosting.virtualserver')),
            ],
        ),
        migrations.AddConstraint(
            model_name='dockercontainer',
            constraint=models.UniqueConstraint(fields=('docker_id', 'parent_server'), name='unique_dockerid_parent'),
        ),
    ]
