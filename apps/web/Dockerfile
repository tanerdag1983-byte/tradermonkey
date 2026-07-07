FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Default to dev server; override at runtime for production preview
# e.g. docker run -e NODE_ENV=production tradermonkeys-web npm start
CMD ["npm", "run", "dev"]
