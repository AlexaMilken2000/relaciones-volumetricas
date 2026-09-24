FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base texlive-latex-recommended texlive-pictures \
    fonts-lmodern \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --chown=node:node server.cjs soil.js latex.js app.js index.html styles.css relaciones-volumetricas.html ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server.cjs"]
