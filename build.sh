#!/bin/bash
echo "Instalando Prisma..."
pip install prisma

echo "Gerando cliente do banco de dados..."
prisma generate

echo "Build concluído!"