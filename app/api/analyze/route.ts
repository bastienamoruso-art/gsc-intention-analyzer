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

    // Préparer les données pour l'analyse
    const queryData = queries.map(q => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position
    }));

    const prompt = `Tu es un consultant SEO senior spécialisé dans l'analyse d'intentions de recherche.

CONTEXTE
- Marque : ${brand || 'non spécifiée'}
- Secteur : ${sector || 'non spécifié'}
- Dataset : ${queryData.length} requêtes issues de Google Search Console

MISSION
Analyse ces requêtes SANS utiliser de catégories prédéfinies. Identifie les PATTERNS RÉELS et les intentions CONCRÈTES des utilisateurs.

DONNÉES
${queryData.slice(0, 100).map(q =>
  `"${q.query}" | Pos: ${q.position.toFixed(1)} | CTR: ${(q.ctr * 100).toFixed(1)}% | Clics: ${q.clicks}`
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

IMPORTANT : Les insights doivent être RICHES, DÉTAILLÉS et contenir des DONNÉES CHIFFRÉES issues de l'analyse (exemples de requêtes, volumes, positions, CTR).

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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extraire le contenu de la réponse
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parser le JSON de la réponse
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Classifier chaque requête selon les intentions découvertes
    const classifiedQueries = queries.map(query => {
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
      classifiedQueries
    });

  } catch (error) {
    console.error('Error analyzing queries:', error);
    return NextResponse.json(
      { error: 'Failed to analyze queries', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
