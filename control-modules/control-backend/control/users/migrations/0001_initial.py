############################################################
#  [*] Users initial migration — fresh, constrained schema
#
#  Runs on a brand-new SQLite file (no legacy adoption).
#  Django-default table names; real FK constraints.
############################################################

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='SystemUser',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.CharField(max_length=255, unique=True)),
                ('password', models.CharField(max_length=255)),
                ('admin', models.BooleanField(default=False)),
                ('enabled', models.BooleanField(default=False)),
                ('last_login', models.DateTimeField(blank=True, null=True)),
            ],
        ),
        migrations.CreateModel(
            name='RegistrationCode',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=32, unique=True)),
                ('valid_until', models.DateTimeField()),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='registration_code', to='users.systemuser')),
            ],
        ),
        migrations.CreateModel(
            name='RecentActivity',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activity', to='users.systemuser')),
            ],
        ),
    ]
