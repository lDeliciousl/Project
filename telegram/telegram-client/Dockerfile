FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "run", "dev"]
