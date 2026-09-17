-- CreateTable
CREATE TABLE "License" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome_empreendimento" TEXT NOT NULL,
    "cnpj" TEXT,
    "cliente" TEXT,
    "numero_poco" TEXT,
    "requerimento_atual" TEXT,
    "requerimento_anterior" TEXT,
    "portaria" TEXT,
    "validade" DATETIME,
    "status" TEXT,
    "data_protocolo" DATETIME,
    "scraped_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "License_cnpj_numero_poco_key" ON "License"("cnpj", "numero_poco");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
