# Trocamos o 'alpine' pelo 'slim' (Debian), que é 100% compatível com o Prisma
FROM node:18-slim

# Instala o OpenSSL atualizado, que é o motor que o Prisma precisa para funcionar
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copia os ficheiros de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instala o Node.js e gera o Prisma Client para a arquitetura correta do Debian
RUN npm install
RUN npx prisma generate

# Copia o resto do projeto
COPY . .

EXPOSE 3000

CMD ["npm", "start"]