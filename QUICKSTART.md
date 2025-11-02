# 🚀 Quick Start - GSC Intention Analyzer

## Test en 3 minutes ⏱️

### 1. Installer les dépendances
```bash
cd /Users/Bastien/gsc-intention-analyzer
npm install
```

### 2. Ajouter votre clé API
Créez le fichier `.env.local` :
```bash
echo "ANTHROPIC_API_KEY=sk-ant-api03-VOTRE_CLE_ICI" > .env.local
```

**Où trouver votre clé ?** https://console.anthropic.com/settings/keys

### 3. Lancer l'outil
```bash
npm run dev
```

Ouvrez http://localhost:3000 dans votre navigateur.

### 4. Tester avec vos données GSC

1. **Exportez depuis Google Search Console :**
   - Allez dans Performance → Requêtes
   - Sélectionnez les 3 derniers mois
   - Cliquez sur l'icône "Exporter" → Télécharger CSV

2. **Uploadez dans l'outil :**
   - Marque (optionnel) : Ex: "Nike"
   - Secteur (optionnel) : Ex: "E-commerce sportif"
   - Uploadez votre CSV GSC
   - Cliquez sur "Analyser les intentions"

3. **Analysez les résultats :**
   - Intentions découvertes automatiquement
   - Matrice Position × Intention avec CTR
   - Patterns linguistiques
   - Recommandations de 5 requêtes à analyser manuellement

---

## 🌐 Déployer en ligne (Vercel)

### Déploiement ultra-rapide

1. **Créez un compte Vercel** : https://vercel.com

2. **Installez Vercel CLI :**
```bash
npm install -g vercel
```

3. **Déployez :**
```bash
vercel login
vercel
```

4. **Ajoutez votre clé API :**
```bash
vercel env add ANTHROPIC_API_KEY
# Collez votre clé API quand demandé
# Sélectionnez "Production, Preview, Development"
```

5. **Redéployez :**
```bash
vercel --prod
```

Votre outil est maintenant en ligne ! 🎉

---

## ❓ Problèmes fréquents

### "Error: Missing API key"
➡️ Vérifiez que `.env.local` contient bien `ANTHROPIC_API_KEY=...`

### "Module not found: recharts"
➡️ Relancez `npm install`

### "Invalid CSV format"
➡️ Assurez-vous d'exporter depuis GSC en format CSV (pas Excel)

### "Model not found"
➡️ Vérifiez que votre clé API Anthropic est valide et active

---

## 📧 Besoin d'aide ?

Ouvrez une issue sur le repo GitHub avec :
- La version de Node.js (`node -v`)
- Le message d'erreur complet
- Les étapes pour reproduire

---

**Temps total d'installation : ~3 minutes ⚡**
