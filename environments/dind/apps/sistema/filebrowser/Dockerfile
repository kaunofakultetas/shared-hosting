FROM filebrowser/filebrowser:v2.31.2

WORKDIR /

COPY filebrowser.json /.filebrowser.json
COPY branding /branding

RUN /filebrowser config init
RUN /filebrowser users add student ''
RUN /filebrowser config set --branding.name "Filebrowser" --branding.files "/branding" --branding.disableExternal --branding.theme "dark"
RUN /filebrowser config set --auth.method=noauth
