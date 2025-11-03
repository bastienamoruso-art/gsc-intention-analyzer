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
      position: q.position
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
      const uniqueWords = new Set(words); // Compter 1 fois par query

      uniqueWords.forEach((word: string) => {
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

3. **INSIGHTS STRATÉGIQUES** (DÉTAILLÉS ET ACTIONNABLES)
   - biggest_opportunity : Décris EN DÉTAIL (2-3 phrases minimum) l'opportunité principale avec des EXEMPLES CONCRETS de requêtes et des CHIFFRES précis issus des données (volume, position, CTR). Explique POURQUOI c'est une opportunité et COMMENT la saisir. NE PAS inclure d'estimations de clics potentiels.
   - biggest_friction : Décris EN DÉTAIL (2-3 phrases minimum) la friction principale avec des EXEMPLES CONCRETS de requêtes et des CHIFFRES précis issus des données (volume, position, CTR). Explique POURQUOI c'est une friction et COMMENT la résoudre. NE PAS inclure d'estimations de clics perdus.
   - quick_win : Décris EN DÉTAIL (2-3 phrases minimum) une action rapide et concrète à mettre en place IMMÉDIATEMENT, avec des EXEMPLES précis de requêtes concernées. Focus sur la RECOMMANDATION ACTIONNABLE, pas sur l'impact chiffré estimé.

CONTRAINTES IMPORTANTES :
- NE JAMAIS recommander de capitaliser sur des fautes d'orthographe - c'est une pratique black-hat interdite
- NE JAMAIS suggérer de créer des URLs spécifiques sans savoir si elles existent déjà - reste sur des recommandations stratégiques de haut niveau
- Privilégier les recommandations WHITE-HAT : optimisation de contenu existant, amélioration de la pertinence, structure de l'information
- Les insights doivent être RICHES, DÉTAILLÉS et contenir des DONNÉES CHIFFRÉES issues de l'analyse (exemples de requêtes, volumes, positions, CTR)
- NE PAS inclure d'estimations de clics futurs ou potentiels (ex: "+300 clics", "récupérer 80 clics") - se concentrer sur les RECOMMANDATIONS ACTIONNABLES

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

    const analysis = JSON.parse(jsonMatch1[0]);

    // ========================================
    // PROMPT 2 : Contrôle qualité quick wins
    // ========================================

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

      // FILTRAGE STRICT : Positions 5-20 UNIQUEMENT + Volume minimum
      const quickWinCandidates = relatedQueries.filter(q =>
        q.position >= 5 &&
        q.position <= 20 &&
        q.impressions >= 100
      );

      return {
        intention: intention.nom,
        queries: quickWinCandidates.map(q => ({
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

INTENTIONS IDENTIFIÉES ET LEURS QUICK WINS CANDIDATS (positions 5-20 uniquement)
${analysis.intentions.map((int: any, idx: number) => `
${idx + 1}. ${int.nom} (${int.description})
   Candidats quick wins (${intentionQueries[idx].queries.length} requêtes en P5-20):
   ${intentionQueries[idx].queries.slice(0, 30).map((q: any) =>
     `   "${q.query}" | Pos: ${q.position.toFixed(1)} | Clics: ${q.clicks} | Imp: ${q.impressions}`
   ).join('\n')}
`).join('\n')}

MISSION : Sélectionner les 10 meilleurs quick wins par intention (MAXIMUM 10)

RÈGLES DE SÉLECTION STRICTES :

1. **DÉDUPLICATION SÉMANTIQUE OBLIGATOIRE**
   - NE JAMAIS sélectionner plusieurs queries quasi-identiques qui ciblent la même SERP
   - Exemples de doublons À ÉVITER :
     ❌ "vélo pour enfant" ET "vélo pour enfants" → MÊME SERP
     ❌ "restaurant paris 11" ET "restaurant paris 11eme" → MÊME SERP
   - Si plusieurs queries similaires : GARDER SEULEMENT celle avec le PLUS d'impressions

2. **PRIORISATION**
   - Volume élevé (impressions > 500 idéal)
   - Position entre 5 et 15 (meilleur potentiel de progression)
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

    if (doubtful.length > 0) {
      // Limiter à 200 queries max pour éviter timeout - prendre les plus volumineuses
      const doubtfulToRefine = doubtful
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 200);

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
          max_tokens: 8192,
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

    return NextResponse.json({
      analysis,
      classifiedQueries,
      brandQueries: brandQueries // Requêtes marque séparées
    });

  } catch (error) {
    console.error('Error analyzing queries:', error);
    return NextResponse.json(
      { error: 'Failed to analyze queries', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
