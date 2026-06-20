FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec prisma generate
RUN pnpm run build
RUN chmod +x entrypoint.sh

EXPOSE 3000

CMD ["./entrypoint.sh"]