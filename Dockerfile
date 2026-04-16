FROM node:20-alpine

WORKDIR /app

# Install nodemon globally for hot reloading
RUN npm install -g nodemon

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Don't copy source - we'll mount it as a volume for hot reload
# COPY . .

EXPOSE 3000

CMD ["nodemon", "server/index.js"]
