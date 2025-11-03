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
    // PROMPT 1 : Analyse + Découverte des intentions
    // ========================================
    const prompt1 = `Tu es un consultant SEO senior spécialisé dans l'analyse d'intentions de recherche.

CONTEXTE
- Marque : ${brand || 'non spécifiée'}
- Secteur : ${sector || 'non spécifié'}
- Dataset : ${queryData.length} requêtes issues de Google Search Console (HORS requêtes marque)

IMPORTANT : Les requêtes contenant "${brand}" ont déjà été EXCLUES du dataset. NE CRÉE PAS d'intention "Accès direct marque" ou similaire.

MISSION
Analyse ces requêtes SANS utiliser de catégories prédéfinies. Identifie les PATTERNS RÉELS et les intentions CONCRÈTES des utilisateurs.

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
   - biggest_opportunity : Décris EN DÉTAIL (2-3 phrases minimum) l'opportunité principale avec des EXEMPLES CONCRETS de requêtes et des CHIFFRES précis (volume, position, CTR). Explique POURQUOI c'est une opportunité et COMMENT la saisir.
   - biggest_friction : Décris EN DÉTAIL (2-3 phrases minimum) la friction principale avec des EXEMPLES CONCRETS de requêtes et des CHIFFRES précis. Explique POURQUOI c'est une friction et COMMENT la résoudre.
   - quick_win : Décris EN DÉTAIL (2-3 phrases minimum) une action rapide et concrète à mettre en place IMMÉDIATEMENT, avec des EXEMPLES précis de requêtes concernées et l'impact attendu.

CONTRAINTES IMPORTANTES :
- NE JAMAIS recommander de capitaliser sur des fautes d'orthographe (ex: "look academy" vs "lock academy") - c'est une pratique black-hat interdite
- NE JAMAIS suggérer de créer des URLs spécifiques (ex: "/escape-game-paris-2-joueurs") sans savoir si elles existent déjà - reste sur des recommandations stratégiques de haut niveau
- Privilégier les recommandations WHITE-HAT : optimisation de contenu existant, amélioration de la pertinence, structure de l'information
- Les insights doivent être RICHES, DÉTAILLÉS et contenir des DONNÉES CHIFFRÉES issues de l'analyse (exemples de requêtes, volumes, positions, CTR)

FORMAT JSON STRICT :
{
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
    const intentionQueries = analysis.intentions.map((intention: any) => {
      const relatedQueries = queryData.filter(q => {
        const queryLower = q.query.toLowerCase();

        // Vérifier signaux linguistiques
        if (intention.signal_linguistique) {
          const signals = intention.signal_linguistique.toLowerCase().split(/[,;]/);
          for (const signal of signals) {
            if (queryLower.includes(signal.trim())) {
              return true;
            }
          }
        }

        // Vérifier exemples
        for (const exemple of intention.exemples) {
          const exempleMots = exemple.toLowerCase().split(' ');
          const queryMots = queryLower.split(' ');
          const motsCommuns = exempleMots.filter((mot: string) => queryMots.includes(mot)).length;
          const similarity = motsCommuns / Math.max(exempleMots.length, queryMots.length);
          if (similarity > 0.4) {
            return true;
          }
        }

        return false;
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

MISSION : Sélectionner les 5-7 meilleurs quick wins par intention

RÈGLES DE SÉLECTION STRICTES :

1. **DÉDUPLICATION SÉMANTIQUE OBLIGATOIRE**
   - NE JAMAIS sélectionner plusieurs queries quasi-identiques
   - Exemples de doublons À ÉVITER :
     ❌ "escape game pour 6" ET "escape game pour 6 personnes" → MÊME SERP
     ❌ "escape game paris 6" ET "escape game 6eme" → MÊME SERP
   - Si plusieurs queries similaires : GARDER SEULEMENT celle avec le PLUS d'impressions

2. **PRIORISATION**
   - Volume élevé (impressions > 500 idéal)
   - Position entre 5 et 15 (meilleur potentiel de progression)
   - CTR faible/moyen (< 10% = opportunité)

3. **LIMITE STRICTE : 5 quick wins MAXIMUM par intention**
   - Qualité > Quantité : ne garder que les MEILLEURES opportunités
   - Chaque query doit être UNIQUE (pas de doublons sémantiques)
   - Si moins de 5 candidats pertinents : ne pas forcer, renvoyer ce qui est vraiment utile

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
      max_tokens: 8192,
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

    // Classifier chaque requête NON-BRAND selon les intentions découvertes
    const classifiedQueries = nonBrandQueries.map(query => {
      let bestMatch = { intention: 'Non classifiée', confidence: 0 };

      for (const intention of analysis.intentions) {
        let confidence = 0;
        const queryLower = query.query.toLowerCase();

        // Vérifier les signaux linguistiques
        if (intention.signal_linguistique) {
          const signals = intention.signal_linguistique.toLowerCase().split(/[,;]/);
          for (const signal of signals) {
            if (queryLower.includes(signal.trim())) {
              confidence += 0.4;
            }
          }
        }

        // Vérifier les exemples
        for (const exemple of intention.exemples) {
          const exempleMots = exemple.toLowerCase().split(' ');
          const queryMots = queryLower.split(' ');
          const motsCommuns = exempleMots.filter((mot: string) => queryMots.includes(mot)).length;
          confidence += (motsCommuns / Math.max(exempleMots.length, queryMots.length)) * 0.6;
        }

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
