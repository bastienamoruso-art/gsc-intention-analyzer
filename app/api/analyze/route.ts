import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { queries, brand, sector } = await request.json();

    if (!queries || !Array.isArray(queries)) {
      return NextResponse.json(
        { error: 'Invalid queries format' },
        { status: 400 }
      );
    }

    // Générer les variantes de la marque (pour filtrage)
    const brandVariants = brand ? [
      brand.toLowerCase(),
      brand.toLowerCase().replace(/\s+/g, ''), // sans espaces
      brand.toLowerCase().replace(/\s+/g, '-'), // avec tirets
      brand.toLowerCase().replace(/\s+/g, '_'), // avec underscores
    ] : [];

    // Séparer requêtes brand / non-brand
    const brandQueries = queries.filter(q =>
      brandVariants.some(variant => q.query.toLowerCase().includes(variant))
    );

    const nonBrandQueries = queries.filter(q =>
      !brandVariants.some(variant => q.query.toLowerCase().includes(variant))
    );

    // Préparer les données pour l'analyse (SEULEMENT non-brand)
    const queryData = nonBrandQueries.map(q => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
      pages: q.pages || [] // Garder les pages pour détection cannibalisation
    }));

    // ========================================
    // CALCUL DES STOPWORDS DYNAMIQUES
    // ========================================
    // Identifier les mots trop fréquents dans le dataset
    // (ex: "velo" apparaît dans 80% des queries d'un site de vélo)
    // Ces mots seront EXCLUS du calcul de similarité pour éviter faux positifs

    const wordFrequency = new Map<string, number>();
    const totalQueries = queryData.length;

    queryData.forEach(q => {
      const words = q.query.toLowerCase().split(/\s+/);
      const uniqueWords: Set<string> = new Set(words); // Compter 1 fois par query

      uniqueWords.forEach((word) => {
        // Ignorer mots < 3 lettres et nombres purs
        if (word.length > 2 && !/^\d+$/.test(word)) {
          wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        }
      });
    });

    // Exclure les TOP 5 mots les plus fréquents (approche générique)
    // Fonctionne pour tous types de sites : niche, large, SaaS, e-commerce, etc.
    const sortedWords = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1]); // Trier par fréquence décroissante

    const topN = 5; // Nombre de stopwords à exclure
    const dynamicStopwords = new Set<string>();

    for (let i = 0; i < Math.min(topN, sortedWords.length); i++) {
      const [word, count] = sortedWords[i];
      dynamicStopwords.add(word);
    }

    console.log('Dynamic stopwords detected:',
      Array.from(dynamicStopwords).map((w, i) => `${w} (${sortedWords[i][1]})`).join(', ')
    );

    // ========================================
    // FONCTION HELPER : Calcul de confiance avec stopwords filtrés
    // ========================================
    const calculateConfidence = (queryLower: string, intention: any): number => {
      let confidence = 0;

      // 1. Vérifier signaux linguistiques (NON filtrés - ce sont des signaux intentionnels)
      if (intention.signal_linguistique) {
        const signals = intention.signal_linguistique.toLowerCase().split(/[,;]/);
        for (const signal of signals) {
          if (queryLower.includes(signal.trim())) {
            confidence += 0.4;
          }
        }
      }

      // 2. Vérifier exemples (FILTRÉS - on retire les stopwords)
      for (const exemple of intention.exemples) {
        const exempleMots = exemple.toLowerCase()
          .split(/\s+/)
          .filter((mot: string) => mot.length > 2 && !/^\d+$/.test(mot) && !dynamicStopwords.has(mot));

        const queryMots = queryLower
          .split(/\s+/)
          .filter((mot: string) => mot.length > 2 && !/^\d+$/.test(mot) && !dynamicStopwords.has(mot));

        const motsCommuns = exempleMots.filter((mot: string) => queryMots.includes(mot)).length;

        // Éviter division par zéro si tous les mots sont des stopwords
        if (exempleMots.length > 0 && queryMots.length > 0) {
          confidence += (motsCommuns / Math.max(exempleMots.length, queryMots.length)) * 0.6;
        }
      }

      return confidence;
    };

    // ========================================
    // PROMPT 1 : Analyse + Découverte des intentions
    // ========================================
    const prompt1 = `Tu es un consultant SEO senior spécialisé dans l'analyse d'intentions de recherche.

CONTEXTE
- Marque : ${brand || 'non spécifiée'}
- Secteur : ${sector || 'non spécifié'}
- Dataset : ${queryData.length} requêtes issues de Google Search Console (HORS requêtes marque)

IMPORTANT : Les requêtes contenant "${brand}" ont déjà été EXCLUES du dataset. NE CRÉE PAS d'intention "Accès direct marque" ou similaire.

MISSION
1. Identifie d'abord la THÉMATIQUE GLOBALE du site (en 1 phrase)
2. Analyse ces requêtes SANS utiliser de catégories prédéfinies
3. Identifie les PATTERNS RÉELS et les intentions CONCRÈTES des utilisateurs

DONNÉES
${queryData.slice(0, 200).map(q =>
  `"${q.query}" | Pos: ${q.position.toFixed(1)} | CTR: ${(q.ctr * 100).toFixed(1)}% | Clics: ${q.clicks} | Imp: ${q.impressions}`
).join('\n')}

ANALYSE REQUISE

1. **INTENTIONS DÉCOUVERTES** (3-6 intentions)
   Pour chaque intention identifiée :
   - nom : Nom court et descriptif (max 4 mots)
   - description : Ce que cherche VRAIMENT l'utilisateur
   - volume : Nombre de requêtes dans ce pattern
   - exemples : 3-5 requêtes typiques
   - signal_linguistique : Pattern de mots récurrent (ex: "comment", "prix", "vs", "2024")
   - ctr_moyen : CTR moyen de ces requêtes
   - position_moyenne : Position moyenne

2. **PATTERNS LINGUISTIQUES**
   - Mots récurrents significatifs
   - Structures de questions
   - Modificateurs temporels (2024, 2025)
   - Termes comparatifs (vs, ou, meilleur)

3. **INSIGHTS STRATÉGIQUES** (NIVEAU 2025 - ANALYSE DATA-DRIVEN)

   - biggest_opportunity : Identifie l'opportunité STRATÉGIQUE la plus impactante en analysant :
     * Les écarts de performance (ex: requêtes similaires avec CTR 10x différents = problème d'alignement intention/contenu)
     * Les segments sous-exploités avec fort potentiel (ex: queries haute intention commerciale en P4-10 avec bon CTR)
     * Les opportunités de différenciation (ex: requêtes spécifiques où le site performe mieux que sur le générique)
     → Fournis des EXEMPLES CONCRETS avec CHIFFRES (requêtes, positions, CTR, volumes)
     → Explique le POURQUOI stratégique et propose une approche MODERNE (pas "ajoutez des mots-clés")

   - biggest_friction : Identifie le problème SYSTÉMIQUE le plus pénalisant :
     * Misalignment intention/contenu (ex: CTR faible malgré bonne position = contenu inadapté)
     * Cannibalisation ou dilution (ex: trafic dispersé sur requêtes génériques vs concentré sur spécifiques)
     * Architecture ou expérience problématique (révélée par les patterns de CTR/position)
     → Fournis des EXEMPLES avec CHIFFRES et CONTRASTES (ex: "requête A : CTR 1% vs requête B similaire : CTR 20%")
     → Explique l'IMPACT BUSINESS et la solution STRATÉGIQUE

   - quick_win : Propose une action CONCRÈTE et MODERNE à impact rapide :
     * Réorganisation de l'information pour mieux matcher l'intention dominante
     * Amélioration de l'expérience utilisateur basée sur les signaux comportementaux (CTR, engagement)
     * Consolidation ou différenciation stratégique de contenu
     → PAS de conseils basiques type "ajoutez X dans le title" ou "optimisez les balises"
     → Focus sur l'EXPÉRIENCE UTILISATEUR et l'ALIGNEMENT INTENTION, pas la technique SEO 2015
     → Fournis des EXEMPLES précis avec DONNÉES

CONTRAINTES STRICTES 2025 :
- ❌ JAMAIS de recommandations techniques basiques (title, H1, meta description, etc.)
- ❌ JAMAIS de "créez une page pour X" sans contexte
- ❌ JAMAIS de capitalisation sur fautes d'orthographe
- ❌ JAMAIS d'estimations chiffrées ("+ X clics", "récupérer Y clics")
- ✅ Focus sur STRATÉGIE, EXPÉRIENCE UTILISATEUR, ALIGNEMENT INTENTION
- ✅ Recommandations basées sur l'ANALYSE DES ÉCARTS DE PERFORMANCE
- ✅ Approche DATA-DRIVEN avec exemples concrets et chiffres issus des données

FORMAT JSON STRICT :
{
  "thematique_site": "string (1 phrase décrivant le type de site et son domaine)",
  "intentions": [
    {
      "nom": "string",
      "description": "string",
      "volume": number,
      "exemples": ["string"],
      "signal_linguistique": "string",
      "ctr_moyen": number,
      "position_moyenne": number
    }
  ],
  "patterns_linguistiques": {
    "mots_recurrents": ["string"],
    "structures_questions": ["string"],
    "modificateurs_temporels": ["string"],
    "termes_comparatifs": ["string"]
  },
  "insights": {
    "biggest_opportunity": "string (2-3 phrases détaillées avec exemples et chiffres)",
    "biggest_friction": "string (2-3 phrases détaillées avec exemples et chiffres)",
    "quick_win": "string (2-3 phrases détaillées avec action concrète)"
  }
}`;

    const message1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt1
        }
      ]
    });

    // Extraire le contenu de la réponse 1
    const content1 = message1.content[0];
    if (content1.type !== 'text') {
      throw new Error('Unexpected response type from prompt 1');
    }

    // Parser le JSON de la réponse 1
    const jsonMatch1 = content1.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch1) {
      throw new Error('No JSON found in response 1');
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch1[0]);
    } catch (parseError) {
      console.error('Failed to parse analysis JSON:', parseError);
      console.error('Raw response 1 (first 1000 chars):', content1.text.substring(0, 1000));
      console.error('JSON match length:', jsonMatch1[0].length);
      throw new Error('Failed to parse analysis JSON - response may be truncated. Try reducing dataset size.');
    }

    // ========================================
    // PROMPT 2 : Contrôle qualité quick wins
    // ========================================

    // Fonction pour normaliser une query (tri alphabétique des mots)
    // Exemple : "escape game paris pas cher" → "cher escape game paris pas"
    function normalizeQuery(query: string): string {
      return query.toLowerCase()
        .split(' ')
        .filter(w => w.length > 0)
        .sort()
        .join(' ');
    }

    // Normaliser les URLs pour fusionner les variantes (avec/sans www, trailing slash, etc.)
    function normalizeUrl(url: string): string {
      try {
        let normalized = url.toLowerCase().trim();

        // Retirer le trailing slash
        if (normalized.endsWith('/')) {
          normalized = normalized.slice(0, -1);
        }

        // Retirer le www. pour unifier les variantes
        normalized = normalized.replace(/^(https?:\/\/)www\./, '$1');

        return normalized;
      } catch (e) {
        return url; // En cas d'erreur, retourner l'URL originale
      }
    }

    // Préparer les requêtes pour chaque intention (avec toutes les données)
    // Utilise la MÊME logique que la classification finale pour cohérence
    const intentionQueries = analysis.intentions.map((intention: any) => {
      const relatedQueries = queryData.filter(q => {
        const queryLower = q.query.toLowerCase();
        const confidence = calculateConfidence(queryLower, intention);

        // Même seuil que classification finale
        // Baissé à 0.4 car stopwords rendent les mots restants plus discriminants
        return confidence >= 0.4;
      });

      // FILTRAGE STRICT : Positions 4-20 UNIQUEMENT + Volume minimum
      const quickWinCandidates = relatedQueries.filter(q =>
        q.position >= 4 &&
        q.position <= 20 &&
        q.impressions >= 100
      );

      // DÉDUPLICATION : Supprimer les permutations de mots identiques
      // Ex: "escape game paris pas cher" et "escape game pas cher paris" → 1 seule
      const seenNormalized = new Map();

      quickWinCandidates.forEach(q => {
        const normalized = normalizeQuery(q.query);

        if (!seenNormalized.has(normalized)) {
          seenNormalized.set(normalized, q);
        } else {
          // Garder celle avec le plus d'impressions
          const existing = seenNormalized.get(normalized);
          if (q.impressions > existing.impressions) {
            seenNormalized.set(normalized, q);
          }
        }
      });

      // Convertir Map en array
      const dedupedCandidates = Array.from(seenNormalized.values());

      return {
        intention: intention.nom,
        queries: dedupedCandidates.map(q => ({
          query: q.query,
          position: q.position,
          clicks: q.clicks,
          impressions: q.impressions,
          // Calculer le CTR RÉEL (pas celui de GSC qui est par ligne)
          ctr: q.impressions > 0 ? (q.clicks / q.impressions) : 0
        }))
      };
    });

    const prompt2 = `Tu es un expert SEO chargé de sélectionner les meilleures opportunités quick wins par intention.

CONTEXTE
- Marque : ${brand || 'non spécifiée'}
- Secteur : ${sector || 'non spécifié'}

INTENTIONS IDENTIFIÉES ET LEURS QUICK WINS CANDIDATS (positions 4-20 uniquement)
${analysis.intentions.map((int: any, idx: number) => `
${idx + 1}. ${int.nom} (${int.description})
   Candidats quick wins (${intentionQueries[idx].queries.length} requêtes en P4-20):
   ${intentionQueries[idx].queries.slice(0, 30).map((q: any) =>
     `   "${q.query}" | Pos: ${q.position.toFixed(1)} | Clics: ${q.clicks} | Imp: ${q.impressions}`
   ).join('\n')}
`).join('\n')}

MISSION : Sélectionner les 10 meilleurs quick wins par intention (MAXIMUM 10)

RÈGLES DE SÉLECTION STRICTES :

1. **DÉDUPLICATION : Supprimer les VRAIS doublons uniquement**

   **À SUPPRIMER (même SERP):**
   - Permutations de mots : ❌ "logiciel gestion stock gratuit" ET "logiciel gratuit gestion stock"
   - Pluriel/singulier : ❌ "vélo pour enfant" ET "vélo pour enfants"
   - Variantes orthographiques : ❌ "restaurant paris 11" ET "restaurant paris 11eme"
   - Synonymes mineurs : ❌ "formation en ligne" ET "formation online"
   → Si doublon détecté : GARDER celle avec le PLUS d'impressions

   **À GARDER (SERP différentes):**
   - Nombres/quantités différents : ✅ "table 2 personnes" ET "table 6 personnes"
   - Modificateurs de qualité : ✅ "hotel paris" ET "meilleur hotel paris" ET "hotel luxe paris"
   - Niveaux/types différents : ✅ "formation debutant" ET "formation avancée"
   - Prix différents : ✅ "prestation pas cher" ET "prestation premium"
   → Ce ne sont PAS des doublons, ce sont des opportunités distinctes pour des audiences différentes

2. **PRIORISATION**
   - Volume élevé (impressions > 500 idéal)
   - Position entre 4 et 15 (meilleur potentiel de progression)
   - CTR faible/moyen (< 10% = opportunité)

3. **LIMITE ABSOLUE : 10 quick wins MAXIMUM par intention - PAS PLUS**
   - Qualité > Quantité : ne garder que les MEILLEURES opportunités
   - Chaque query doit être UNIQUE (pas de doublons sémantiques)
   - Si moins de 10 candidats pertinents : ne pas forcer, renvoyer ce qui est vraiment utile
   - NE JAMAIS dépasser 10 quick wins par intention

FORMAT JSON STRICT :
{
  "quick_wins_par_intention": [
    {
      "intention": "string",
      "quick_wins": [
        {
          "query": "string",
          "position": number,
          "impressions": number,
          "clicks": number,
          "ctr": number (fraction, ex: 0.025 pour 2.5%, PAS 2.5 ou 25),
          "potentiel_impressions": number
        }
      ]
    }
  ]
}

IMPORTANT :
- Le CTR doit être une FRACTION (clics/impressions), ex: 0.025 pour 2.5%
- Renvoie UNIQUEMENT le JSON, sans texte avant ou après.`;

    const message2 = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16384, // Augmenté pour datasets volumineux
      messages: [
        {
          role: 'user',
          content: prompt2
        }
      ]
    });

    // Extraire le contenu de la réponse 2
    const content2 = message2.content[0];
    if (content2.type !== 'text') {
      throw new Error('Unexpected response type from prompt 2');
    }

    // Parser le JSON de la réponse 2 avec meilleure gestion d'erreur
    const jsonMatch2 = content2.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch2) {
      console.warn('No JSON found in prompt 2 response, skipping quick wins optimization');
      // Pas de quick wins optimisés, on continue sans erreur
      analysis.quick_wins_par_intention = [];
    } else {
      try {
        const quickWins = JSON.parse(jsonMatch2[0]);
        // Fusionner les résultats
        analysis.quick_wins_par_intention = quickWins.quick_wins_par_intention || [];
      } catch (parseError) {
        console.error('Failed to parse quick wins JSON:', parseError);
        console.error('Raw response 2:', content2.text);
        // Fallback : pas de quick wins optimisés
        analysis.quick_wins_par_intention = [];
      }
    }

    // ========================================
    // CLASSIFICATION HYBRID : Algo + Claude pour queries douteuses
    // ========================================

    // Étape 1 : Classification algorithmique
    const algoClassified = nonBrandQueries.map(query => {
      let bestMatch = { intention: 'Non classifiée', confidence: 0 };
      const queryLower = query.query.toLowerCase();

      for (const intention of analysis.intentions) {
        const confidence = calculateConfidence(queryLower, intention);

        if (confidence > bestMatch.confidence) {
          bestMatch = { intention: intention.nom, confidence };
        }
      }

      return {
        ...query,
        intention: bestMatch.intention,
        confidence: bestMatch.confidence
      };
    });

    // Étape 2 : Séparer selon la confiance
    const highConfidence = algoClassified.filter(q => q.confidence >= 0.5);
    const doubtful = algoClassified.filter(q => q.confidence >= 0.15 && q.confidence < 0.5);
    const lowConfidence = algoClassified.filter(q => q.confidence < 0.15);

    console.log(`Classification: ${highConfidence.length} high / ${doubtful.length} doubtful / ${lowConfidence.length} low`);

    // Étape 3 : Claude affine les queries douteuses (si il y en a)
    let refinedDoubtful = doubtful;

    // DÉSACTIVÉ TEMPORAIREMENT - Problème de troncation JSON avec gros datasets
    // On garde uniquement la classification algorithmique pour éviter les erreurs
    const SKIP_CLAUDE_REFINEMENT = true;

    if (doubtful.length > 0 && !SKIP_CLAUDE_REFINEMENT) {
      // Limiter à 20 queries max pour éviter JSON truncation - prendre les plus volumineuses
      const doubtfulToRefine = doubtful
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20);

      const prompt3 = `Tu es un expert SEO chargé d'affiner la classification de requêtes.

CONTEXTE DU SITE
Thématique : ${analysis.thematique_site || 'non identifiée'}
Secteur : ${sector || 'non spécifié'}

INTENTIONS IDENTIFIÉES
${analysis.intentions.map((int: any, idx: number) => `${idx + 1}. ${int.nom}
   Description : ${int.description}
   Exemples : ${int.exemples.join(', ')}
   Signal linguistique : ${int.signal_linguistique || 'aucun'}`).join('\n\n')}

REQUÊTES À CLASSIFIER (${doubtfulToRefine.length} requêtes)
${doubtfulToRefine.map(q => `"${q.query}"`).join('\n')}

MISSION
Pour chaque requête, détermine la meilleure intention OU "Non classifiée" si aucune ne correspond.

RÈGLES IMPORTANTES
- Utilise la THÉMATIQUE du site pour contextualiser : les mots du domaine (ex: "velo" pour un site vélo) sont NORMAUX et ne doivent pas influencer négativement
- Une query "dynamo velo" sur un site vélo est probablement NON pertinente pour "Programmes entraînement" même si "velo" est présent
- Une query "appli entrainement velo" sur un site vélo EST pertinente pour "Programmes entraînement" car "entrainement" est le discriminant
- Privilégie la PRÉCISION : en cas de doute, mets "Non classifiée"

FORMAT JSON STRICT :
{
  "classifications": [
    {
      "query": "string",
      "intention": "string (nom de l'intention ou 'Non classifiée')",
      "justification": "string (1 phrase courte)"
    }
  ]
}`;

      try {
        const message3 = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 16384,
          messages: [{ role: 'user', content: prompt3 }]
        });

        const content3 = message3.content[0];
        if (content3.type === 'text') {
          const jsonMatch3 = content3.text.match(/\{[\s\S]*\}/);
          if (jsonMatch3) {
            const refinement = JSON.parse(jsonMatch3[0]);

            // Fusionner les classifications de Claude
            refinedDoubtful = doubtful.map(q => {
              const claudeClass = refinement.classifications.find(
                (c: any) => c.query.toLowerCase() === q.query.toLowerCase()
              );

              if (claudeClass) {
                return {
                  ...q,
                  intention: claudeClass.intention,
                  confidence: claudeClass.intention === 'Non classifiée' ? 0 : 0.4 // Claude confirme
                };
              }
              return q; // Garder classification algo
            });

            console.log(`Claude refined ${refinement.classifications.length} doubtful queries`);
          }
        }
      } catch (error) {
        console.warn('Claude refinement failed, keeping algo classifications:', error);
        // Fallback : garder classifications algo
      }
    }

    // Étape 4 : Fusionner tous les résultats
    const classifiedQueries = [
      ...highConfidence,
      ...refinedDoubtful,
      ...lowConfidence.map(q => ({ ...q, intention: 'Non classifiée', confidence: 0 }))
    ];

    // ========================================
    // DÉTECTION CANNIBALISATION
    // ========================================

    // DÉDUPLICATION : Supprimer les permutations de mots identiques
    // Ex: "escape game paris a 2" et "escape game a 2 paris" → 1 seule
    const seenNormalizedCannib = new Map();

    queryData.forEach(q => {
      const normalized = normalizeQuery(q.query);

      if (!seenNormalizedCannib.has(normalized)) {
        seenNormalizedCannib.set(normalized, q);
      } else {
        // Garder celle avec le plus d'impressions
        const existing = seenNormalizedCannib.get(normalized);
        if (q.impressions > existing.impressions) {
          seenNormalizedCannib.set(normalized, q);
        }
      }
    });

    // Convertir Map en array
    const dedupedQueryData = Array.from(seenNormalizedCannib.values());

    // APPROCHE PAR REQUÊTE : Identifier les requêtes avec cannibalisation
    // Pour chaque requête, montrer quelles URLs se battent
    const cannibalisationsByQuery = dedupedQueryData
      .filter(q => {
        if (!q.pages || q.pages.length <= 1) return false;

        // Pages significatives (≥5% impressions, position 1-20)
        const significantPages = q.pages
          .filter(p => p.position >= 1 && p.position <= 20)
          .map(p => ({
            ...p,
            impressionsPercentage: (p.impressions / q.impressions) * 100
          }))
          .filter(p => p.impressionsPercentage >= 5);

        return significantPages.length >= 2;
      })
      .map(q => {
        const pagesInTop20 = q.pages
          .filter(p => p.position >= 1 && p.position <= 20)
          .map(p => ({
            url: p.url,
            position: p.position,
            clicks: p.clicks,
            impressions: p.impressions,
            ctr: p.impressions > 0 ? (p.clicks / p.impressions) : 0,
            impressionsPercentage: (p.impressions / q.impressions) * 100
          }))
          .filter(p => p.impressionsPercentage >= 5)
          .sort((a, b) => b.impressionsPercentage - a.impressionsPercentage);

        return {
          query: q.query,
          totalClicks: q.clicks,
          totalImpressions: q.impressions,
          avgPosition: q.position,
          urlsCount: pagesInTop20.length,
          pages: pagesInTop20
        };
      });

    // Calculer totaux pour filtrage adaptatif
    const totalCannibImpressions = cannibalisationsByQuery.reduce(
      (sum, c) => sum + c.totalImpressions, 0
    );

    // FILTRAGE ADAPTATIF : Ne garder que les requêtes vraiment problématiques
    const cannibalisations = cannibalisationsByQuery
      .filter(c => {
        const impressionShare = (c.totalImpressions / totalCannibImpressions) * 100;

        // Critère 1 : Au moins 3 URLs en compétition (cannibalisation sérieuse)
        const hasManyCompetitors = c.urlsCount >= 3;

        // Critère 2 : Capte au moins 1% des impressions en cannibalisation
        const hasSignificantImpact = impressionShare >= 1;

        // Garder si au moins un critère est rempli
        return hasManyCompetitors || hasSignificantImpact;
      })
      .sort((a, b) => b.totalImpressions - a.totalImpressions) // Trier par impact (impressions)
      .slice(0, 20); // Limiter au top 20 requêtes les plus impactantes

    console.log(`Cannibalisations detected: ${cannibalisations.length} queries with multiple competing URLs`);

    // ========================================
    // DÉTECTION PROBLÈMES TECHNIQUES D'URL
    // ========================================
    // Identifier les variantes techniques d'une même URL (www/non-www, trailing slash, http/https)
    // Ces problèmes indiquent l'absence de redirections 301 et causent une dilution du SEO

    const technicalIssues: any[] = [];

    // Parcourir toutes les requêtes avec leurs pages
    queryData.forEach(q => {
      if (!q.pages || q.pages.length <= 1) return;

      const pagesInTop20 = q.pages.filter(p => p.position >= 1 && p.position <= 20);
      if (pagesInTop20.length <= 1) return;

      // Grouper les URLs par version normalisée
      const urlGroups = new Map<string, any[]>();

      pagesInTop20.forEach(page => {
        const normalized = normalizeUrl(page.url);
        if (!urlGroups.has(normalized)) {
          urlGroups.set(normalized, []);
        }
        urlGroups.get(normalized)!.push(page);
      });

      // Trouver les groupes avec plusieurs variantes techniques
      urlGroups.forEach((variants, normalized) => {
        if (variants.length >= 2) {
          // Détecter le type de problème
          const urls = variants.map(v => v.url);
          const issueTypes: string[] = [];

          // Vérifier www/non-www
          const hasWww = urls.some(u => u.includes('://www.'));
          const hasNonWww = urls.some(u => !u.includes('://www.') && u.startsWith('http'));
          if (hasWww && hasNonWww) issueTypes.push('www/non-www');

          // Vérifier trailing slash
          const hasTrailing = urls.some(u => u.endsWith('/'));
          const hasNoTrailing = urls.some(u => !u.endsWith('/'));
          if (hasTrailing && hasNoTrailing) issueTypes.push('trailing-slash');

          // Vérifier http/https
          const hasHttp = urls.some(u => u.startsWith('http://'));
          const hasHttps = urls.some(u => u.startsWith('https://'));
          if (hasHttp && hasHttps) issueTypes.push('http-https');

          if (issueTypes.length > 0) {
            const totalImpressions = variants.reduce((sum, v) => sum + (v.impressions || 0), 0);
            const totalClicks = variants.reduce((sum, v) => sum + (v.clicks || 0), 0);

            technicalIssues.push({
              query: q.query,
              issueTypes,
              variants: variants.map(v => ({
                url: v.url,
                impressions: v.impressions || 0,
                clicks: v.clicks || 0,
                position: v.position || 0,
                impressionsPercentage: totalImpressions > 0
                  ? ((v.impressions || 0) / totalImpressions) * 100
                  : 0
              })).sort((a, b) => b.impressions - a.impressions),
              totalImpressions,
              totalClicks,
              variantsCount: variants.length
            });
          }
        }
      });
    });

    // Trier par impact (impressions) et dédupliquer
    const seenGroups = new Map();
    const uniqueTechnicalIssues = technicalIssues
      .sort((a, b) => b.totalImpressions - a.totalImpressions)
      .filter(issue => {
        // Créer une clé unique basée sur les URLs (triées)
        const key = issue.variants.map((v: any) => v.url).sort().join('|');
        if (seenGroups.has(key)) return false;
        seenGroups.set(key, true);
        return true;
      })
      .slice(0, 20); // Top 20 problèmes techniques

    console.log(`Technical URL issues detected: ${uniqueTechnicalIssues.length} groups of URL variants`);

    return NextResponse.json({
      analysis,
      classifiedQueries,
      brandQueries: brandQueries, // Requêtes marque séparées
      cannibalisations, // Dangers de cannibalisation
      technicalIssues: uniqueTechnicalIssues // NOUVEAU : Problèmes techniques d'URL
    });

  } catch (error) {
    console.error('Error analyzing queries:', error);
    return NextResponse.json(
      { error: 'Failed to analyze queries', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
