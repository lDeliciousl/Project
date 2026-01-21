FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3005

CMD ["npm", "run", "dev"]
