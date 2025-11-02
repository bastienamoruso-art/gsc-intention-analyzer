# 🎯 GSC Intention Analyzer

Outil d'analyse automatique des micro-intentions dans vos données Google Search Console.

## ✨ Fonctionnalités

- ✅ **Classification dynamique** : Découverte automatique des intentions (pas de catégories fixes)
- ✅ **Matrice Position × Intention** : CTR moyen calculé sur VOS données
- ✅ **Patterns linguistiques** : Détection des structures récurrentes
- ✅ **Insights actionnables** : Opportunités, frictions, quick wins
- ✅ **Guide vers analyse manuelle** : Sélection des 5 requêtes stratégiques

## 🚀 Installation en local

### Prérequis

- Node.js 18+ installé
- Une clé API Anthropic (https://console.anthropic.com/)

### Étapes

1. **Cloner le projet**
```bash
cd /Users/Bastien/gsc-intention-analyzer
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer la clé API**
```bash
cp .env.local.example .env.local
```

Éditez `.env.local` et ajoutez votre clé API :
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

4. **Lancer en développement**
```bash
npm run dev
```

Ouvrez http://localhost:3000

## 📦 Déploiement sur Vercel (RECOMMANDÉ)

### Pourquoi Vercel ?
- ✅ Hébergement gratuit
- ✅ HTTPS automatique
- ✅ Déploiement en 2 minutes
- ✅ Gestion sécurisée des variables d'environnement
- ✅ Aucune configuration serveur

### Étapes de déploiement

#### 1. Créer un compte Vercel

Allez sur https://vercel.com et créez un compte (gratuit).

#### 2. Initialiser Git (si pas déjà fait)

```bash
cd /Users/Bastien/gsc-intention-analyzer
git init
git add .
git commit -m "Initial commit: GSC Intention Analyzer"
```

#### 3. Option A : Déployer via GitHub (RECOMMANDÉ)

1. Créez un nouveau repo sur GitHub
2. Poussez votre code :
```bash
git remote add origin https://github.com/VOTRE-USERNAME/gsc-intention-analyzer.git
git branch -M main
git push -u origin main
```

3. Sur Vercel :
   - Cliquez sur "New Project"
   - Importez votre repo GitHub
   - Vercel détectera automatiquement Next.js

4. Configurez les variables d'environnement :
   - Dans "Environment Variables", ajoutez :
     - `ANTHROPIC_API_KEY` = votre clé API

5. Cliquez sur "Deploy"

#### 3. Option B : Déployer via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

Suivez les instructions et ajoutez la variable d'environnement quand demandé.

#### 4. Ajouter la clé API

Dans le dashboard Vercel :
- Projet → Settings → Environment Variables
- Ajoutez `ANTHROPIC_API_KEY` avec votre clé
- Sélectionnez "Production, Preview, Development"
- Redéployez le projet

### ⚠️ IMPORTANT : Sécurité

**NE JAMAIS** :
- ❌ Commiter `.env.local` dans Git
- ❌ Exposer votre clé API dans le code frontend
- ❌ Partager votre clé API publiquement

**TOUJOURS** :
- ✅ Utiliser les variables d'environnement
- ✅ Garder la clé API côté serveur (API Routes)
- ✅ Ajouter `.env.local` dans `.gitignore`

## 🎯 Utilisation

1. **Préparez votre export GSC**
   - Google Search Console → Performance → Requêtes
   - Exportez en CSV

2. **Uploadez dans l'outil**
   - Entrez votre marque (optionnel)
   - Entrez votre secteur (optionnel)
   - Uploadez le CSV

3. **Analysez**
   - L'outil découvre automatiquement les intentions
   - Génère la matrice Position × Intention
   - Détecte les patterns linguistiques

4. **Passez à l'analyse manuelle**
   - Sélectionnez les 5 requêtes recommandées
   - Tapez-les dans Google
   - Analysez les SERP manuellement (comme dans la méthodologie Newsletter)

## 📊 Structure du projet

```
gsc-intention-analyzer/
├── app/
│   ├── api/
│   │   └── analyze/
│   │       └── route.ts          # API Route sécurisée (appel Claude)
│   ├── layout.tsx                # Layout principal
│   └── page.tsx                  # Page d'accueil
├── components/
│   └── GSCIntentionAnalyzer.tsx  # Composant React principal
├── .env.local.example            # Template variables d'environnement
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Architecture technique

### Frontend (React/Next.js)
- Upload CSV avec parsing automatique
- Interface en 2 étapes (Upload → Résultats)
- Visualisations avec Recharts (PieChart, Matrice)

### Backend (Next.js API Routes)
- Endpoint `/api/analyze` pour appels Claude
- Classification avec claude-3-5-sonnet-20241022
- Prompt optimisé pour découverte dynamique d'intentions

### Sécurité
- Clé API stockée côté serveur uniquement
- Validation des données d'entrée
- Pas de stockage de données utilisateur

## 🐛 Bugs corrigés (par rapport à la version initiale)

✅ **Clé API manquante** : Maintenant dans variables d'environnement
✅ **CORS client-side** : API Routes Next.js côté serveur
✅ **Modèle invalide** : Utilise `claude-3-5-sonnet-20241022`
✅ **Catégories fixes** : Classification dynamique
✅ **Pas de matrice CTR** : Matrice Position × Intention implémentée
✅ **Parsing CSV fragile** : Gère tous formats d'export GSC

## 📚 Méthodologie

Cet outil automatise la **classification et la génération de matrice** (2 min).

L'**analyse manuelle des SERP** (1h30) reste nécessaire pour :
- Comprendre les contenus qui rankent
- Identifier les formats gagnants
- Affiner la stratégie de contenu

Voir les newsletters fournies pour la méthodologie complète.

## 💡 Roadmap (optionnel)

- [ ] Export des résultats en PDF/CSV
- [ ] Comparaison historique entre exports
- [ ] Rate limiting pour usage public
- [ ] Authentification utilisateur
- [ ] Dashboard multi-projets

## 📝 License

Usage personnel et commercial autorisé.

## 🤝 Support

Pour toute question, ouvrez une issue sur le repo GitHub.

---

**Made with ❤️ for SEO professionals**
