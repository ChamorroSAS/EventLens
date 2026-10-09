FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2
RUN apk add --no-cache ffmpeg=8.0.1-r1 libheif=1.23.0-r0 libheif-tools=1.23.0-r0
WORKDIR /lab
USER node
ENTRYPOINT ["node","/code/cli.mjs"]
