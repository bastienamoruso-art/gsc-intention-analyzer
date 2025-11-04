'use client';

import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, Cell, ResponsiveContainer, PieChart, Pie
} from 'recharts';

interface QueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  intention?: string;
  confidence?: number;
}

interface Intention {
  nom: string;
  description: string;
  volume: number;
  exemples: string[];
  signal_linguistique: string;
  ctr_moyen: number;
  position_moyenne: number;
}

interface QuickWin {
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  action: string;
}

interface QuickWinsByIntention {
  intention: string;
  quick_wins: QuickWin[];
}

interface Analysis {
  intentions: Intention[];
  patterns_linguistiques: {
    mots_recurrents: string[];
    structures_questions: string[];
    modificateurs_temporels: string[];
    termes_comparatifs: string[];
  };
  insights: {
    biggest_opportunity: string;
    biggest_friction: string;
    quick_win: string;
  };
  quick_wins_par_intention?: QuickWinsByIntention[];
}

const COLORS = ['#f7c724', '#0edd89', '#27f6c5', '#c526f6', '#27bef7', '#fdf13e', '#f142fd'];

export default function GSCIntentionAnalyzer() {
  const [step, setStep] = useState<number>(1);
  const [brand, setBrand] = useState<string>('');
  const [sector, setSector] = useState<string>('');
  const [queries, setQueries] = useState<QueryData[]>([]);
  const [classifiedQueries, setClassifiedQueries] = useState<QueryData[]>([]);
  const [brandQueries, setBrandQueries] = useState<QueryData[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{ intention: string; posGroup: string; queries: QueryData[] } | null>(null);
  const [expandedIntention, setExpandedIntention] = useState<string | null>(null);
  const [showEmailPopup, setShowEmailPopup] = useState<boolean>(false);
  const [showBrandQueries, setShowBrandQueries] = useState<boolean>(false);
  const [showAllKeywordsForIntention, setShowAllKeywordsForIntention] = useState<string | null>(null);
  const [expandedCannibalisation, setExpandedCannibalisation] = useState<string | null>(null);
  const [cannibalisations, setCannibalisations] = useState<Array<{
    query: string;
    totalClicks: number;
    totalImpressions: number;
    avgPosition: number;
    pages: Array<{
      url: string;
      position: number;
      clicks: number;
      impressions: number;
      ctr: number;
    }>;
  }>>([]);

  const [expandedTechnicalIssue, setExpandedTechnicalIssue] = useState<string | null>(null);
  const [technicalIssues, setTechnicalIssues] = useState<Array<{
    query: string;
    issueTypes: string[];
    variants: Array<{
      url: string;
      impressions: number;
      clicks: number;
      position: number;
      impressionsPercentage: number;
    }>;
    totalImpressions: number;
    totalClicks: number;
    variantsCount: number;
  }>>([]);

  // États pour connexion GSC OAuth
  const [gscAccessToken, setGscAccessToken] = useState<string>('');
  const [gscSites, setGscSites] = useState<Array<{ siteUrl: string; permissionLevel: string }>>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [isLoadingGsc, setIsLoadingGsc] = useState<boolean>(false);

  // Afficher la popup 15 secondes après les résultats
  React.useEffect(() => {
    if (step === 2 && analysis) {
      const timer = setTimeout(() => {
        setShowEmailPopup(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [step, analysis]);

  // Listener pour recevoir le token OAuth
  React.useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.accessToken) {
        setGscAccessToken(event.data.accessToken);
        setIsLoadingGsc(true);

        // Récupérer la liste des sites
        try {
          const response = await fetch('/api/gsc/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: event.data.accessToken })
          });

          if (!response.ok) {
            throw new Error('Failed to fetch GSC sites');
          }

          const data = await response.json();
          setGscSites(data.sites);
          setIsLoadingGsc(false);
        } catch (error) {
          console.error('Error fetching GSC sites:', error);
          setError('Échec de la récupération des sites GSC');
          setIsLoadingGsc(false);
        }
      } else if (event.data.error) {
        setError('Erreur d\'authentification Google');
        setIsLoadingGsc(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fonction pour se connecter à GSC
  const connectToGSC = () => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      '/api/auth/gsc',
      'gsc-auth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  // Fonction pour récupérer les données GSC
  const fetchGSCData = async () => {
    if (!selectedSite || !gscAccessToken) {
      setError('Veuillez sélectionner un site');
      return;
    }

    setIsLoadingGsc(true);
    setError('');

    try {
      // Calculer les dates (12 derniers mois)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);

      const response = await fetch('/api/gsc/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: gscAccessToken,
          siteUrl: selectedSite,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch GSC data');
      }

      const data = await response.json();

      // Filtrer et valider les données comme pour le CSV
      const cleanedQueries = data.queries
        .filter((q: any) => q.query && q.query.trim() && q.impressions > 0)
        .map((q: any) => ({
          query: String(q.query).trim(),
          clicks: Number(q.clicks) || 0,
          impressions: Number(q.impressions) || 0,
          ctr: Number(q.ctr) || 0,
          position: Number(q.position) || 0,
          pages: q.pages || [] // IMPORTANT: Conserver les pages pour la détection de cannibalisation
        }));

      if (cleanedQueries.length === 0) {
        setError('Aucune donnée valide trouvée dans la Search Console');
        setIsLoadingGsc(false);
        return;
      }

      setQueries(cleanedQueries);
      setIsLoadingGsc(false);
      console.log(`✅ ${cleanedQueries.length} requêtes chargées depuis GSC`);
    } catch (error) {
      console.error('Error fetching GSC data:', error);
      setError('Échec de la récupération des données GSC');
      setIsLoadingGsc(false);
    }
  };

  // Analyser avec Claude
  const analyzeQueries = async () => {
    if (queries.length === 0) {
      setError('Aucune requête à analyser');
      return;
    }

    if (!brand || brand.trim() === '') {
      setError('Le champ "Marque" est obligatoire');
      return;
    }

    setIsLoading(true);
    setError('');

    // 1. Filtrer par impressions minimum (50+) pour éliminer le bruit
    // 2. Limiter à 5000 queries max pour éviter timeout et erreurs de parsing
    // 3. Trier par impressions décroissantes pour garder les plus importantes
    const MIN_IMPRESSIONS = 50;
    const MAX_QUERIES = 5000;

    let queriesToAnalyze = queries.filter(q => q.impressions >= MIN_IMPRESSIONS);

    console.log(`📊 Filtrage: ${queries.length} → ${queriesToAnalyze.length} queries (impressions ≥ ${MIN_IMPRESSIONS})`);

    if (queriesToAnalyze.length > MAX_QUERIES) {
      queriesToAnalyze = [...queriesToAnalyze]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, MAX_QUERIES);

      console.log(`⚠️ Dataset réduit à ${MAX_QUERIES} requêtes (top impressions)`);
    }

    if (queriesToAnalyze.length === 0) {
      setError(`Aucune requête avec au moins ${MIN_IMPRESSIONS} impressions. Veuillez ajuster vos filtres.`);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: queriesToAnalyze, brand, sector })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze queries');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setClassifiedQueries(data.classifiedQueries);
      setBrandQueries(data.brandQueries || []);
      setCannibalisations(data.cannibalisations || []);
      setTechnicalIssues(data.technicalIssues || []);
      setStep(2);
    } catch (err) {
      setError('Erreur analyse : ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Générer matrice Position × Intention
  const generateMatrix = () => {
    if (!classifiedQueries.length || !analysis) return [];

    const positionGroups = [
      { label: 'P1-3', min: 1, max: 3 },
      { label: 'P4-7', min: 4, max: 7 },
      { label: 'P8-10', min: 8, max: 10 },
      { label: 'P11+', min: 11, max: 100 }
    ];

    return positionGroups.map(group => {
      const row: any = { position: group.label };

      analysis.intentions.forEach(intention => {
        const queriesInCell = classifiedQueries.filter(q =>
          q.intention === intention.nom &&
          q.position >= group.min &&
          q.position <= group.max
        );

        if (queriesInCell.length > 0) {
          const totalImpressions = queriesInCell.reduce((sum, q) => sum + q.impressions, 0);
          const totalClicks = queriesInCell.reduce((sum, q) => sum + q.clicks, 0);

          // Vérifier si l'échantillon est fiable (min 100 impressions OU 10 clics)
          const isReliable = totalImpressions >= 100 || totalClicks >= 10;

          const avgCTR = queriesInCell.reduce((sum, q) => sum + q.ctr, 0) / queriesInCell.length;
          row[intention.nom] = {
            ctr: avgCTR,
            count: queriesInCell.length,
            queries: queriesInCell,
            isReliable: isReliable
          };
        } else {
          row[intention.nom] = { ctr: 0, count: 0, queries: [], isReliable: false };
        }
      });

      return row;
    });
  };

  // Calcul de similarité (Jaccard)
  const calculateSimilarity = (query1: string, query2: string): number => {
    const words1 = query1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = query2.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const intersection = words1.filter(w => words2.includes(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return union > 0 ? intersection / union : 0;
  };

  // Grouper les requêtes similaires et garder la meilleure de chaque groupe
  const groupSimilarQueries = (queries: QueryData[], threshold = 0.75): QueryData[] => {
    const groups: QueryData[][] = [];

    for (const query of queries) {
      let addedToGroup = false;

      for (const group of groups) {
        if (calculateSimilarity(query.query, group[0].query) >= threshold) {
          group.push(query);
          addedToGroup = true;
          break;
        }
      }

      if (!addedToGroup) {
        groups.push([query]);
      }
    }

    // Pour chaque groupe, garder la meilleure (position la plus haute = numéro le plus bas)
    return groups.map(group =>
      group.reduce((best, current) =>
        current.position < best.position ? current : best
      )
    );
  };

  // Détails par intention
  const getIntentionDetails = (intentionNom: string) => {
    const intentionQueries = classifiedQueries.filter(q => q.intention === intentionNom);
    const totalClicks = intentionQueries.reduce((sum, q) => sum + q.clicks, 0);
    const totalImpressions = intentionQueries.reduce((sum, q) => sum + q.impressions, 0);

    // IMPORTANT: créer une copie avant de trier pour ne pas modifier l'array original
    const top5 = [...intentionQueries].sort((a, b) => b.clicks - a.clicks).slice(0, 5);

    const positionDistribution = {
      'P1-3': intentionQueries.filter(q => q.position >= 1 && q.position <= 3).length,
      'P4-7': intentionQueries.filter(q => q.position >= 4 && q.position <= 7).length,
      'P8-10': intentionQueries.filter(q => q.position >= 8 && q.position <= 10).length,
      'P11+': intentionQueries.filter(q => q.position >= 11).length,
    };

    // Filtrer les quick wins (P5-20 avec >100 impressions)
    const quickWinsFiltered = intentionQueries.filter(q =>
      q.position >= 5 && q.position <= 20 && q.impressions > 100
    );

    // Grouper les requêtes similaires et garder top 10 diversifiées
    const quickWins = groupSimilarQueries(quickWinsFiltered)
      .sort((a, b) => a.position - b.position)
      .slice(0, 10);

    return { totalClicks, totalImpressions, top5, positionDistribution, quickWins, allQueries: intentionQueries };
  };

  // Styles communs
  const styles = {
    title: { fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 },
    text: { fontFamily: 'Roboto, sans-serif' },
    button: {
      background: '#f7c724',
      color: '#000',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      fontFamily: 'JetBrains Mono, monospace',
      transition: 'all 0.2s'
    },
    card: {
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '12px',
      padding: '24px'
    }
  };

  // Formater un insight pour meilleure lisibilité
  const formatInsight = (text: string) => {
    // Séparer en phrases
    const sentences = text.split(/\.\s+/).filter(s => s.trim());

    return (
      <div style={{ lineHeight: '1.8' }}>
        {sentences.map((sentence, idx) => {
          // Regex pour détecter les citations (avec groupes non-capturants)
          const parts = sentence.split(/("(?:[^"]*)"|"(?:[^"]*)")/g);

          return (
            <div key={idx} style={{ marginBottom: idx < sentences.length - 1 ? '12px' : 0 }}>
              <span style={{ ...styles.text, fontSize: '14px' }}>
                {parts
                  .filter(part => part && part.trim()) // Filtrer les parties vides
                  .map((part, partIdx) => {
                    // Si c'est une citation (requête exemple)
                    if (/^"[^"]*"$/.test(part) || /^"[^"]*"$/.test(part)) {
                      return (
                        <span key={partIdx} style={{
                          background: 'rgba(247, 199, 36, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontStyle: 'italic',
                          color: '#fdf13e'
                        }}>
                          {part}
                        </span>
                      );
                    }
                    // Texte normal
                    return <span key={partIdx}>{part}</span>;
                  })}
                {idx < sentences.length - 1 && '.'}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Footer component
  const Footer = () => (
    <div style={{
      background: '#000',
      borderTop: '1px solid #333',
      padding: '30px 40px',
      marginTop: '60px',
      textAlign: 'center'
    }}>
      <p style={{ ...styles.text, margin: 0, fontSize: '14px', color: '#999' }}>
        créé par <strong style={{ color: '#f7c724' }}>Bastien Amoruso</strong> - Freelance SEO
      </p>
      <div style={{ marginTop: '12px', display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'center' }}>
        <a
          href="https://www.linkedin.com/in/bastien-amoruso-kamak/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...styles.text,
            color: '#f7c724',
            textDecoration: 'none',
            fontSize: '14px',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          🔗 LinkedIn
        </a>
        <span style={{ color: '#333' }}>•</span>
        <a
          href="mailto:bastien.amoruso@kamak.ai"
          style={{
            ...styles.text,
            color: '#f7c724',
            textDecoration: 'none',
            fontSize: '14px',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          ✉️ bastien.amoruso@kamak.ai
        </a>
      </div>
    </div>
  );

  // ÉCRAN DE CHARGEMENT avec Newsletter
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        padding: '40px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          maxWidth: '600px',
          textAlign: 'center'
        }}>
          {/* Loader animé */}
          <div style={{
            width: '80px',
            height: '80px',
            border: '6px solid #333',
            borderTop: '6px solid #f7c724',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 30px'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>

          <h2 style={{
            ...styles.title,
            fontSize: '28px',
            color: '#f7c724',
            marginBottom: '16px'
          }}>
            ⚡ Analyse en cours...
          </h2>

          <p style={{
            ...styles.text,
            fontSize: '16px',
            color: '#999',
            marginBottom: '40px',
            lineHeight: '1.6'
          }}>
            L'analyse peut durer <strong style={{ color: '#fff' }}>2 à 3 minutes</strong>.<br />
            Pendant ce temps, découvrez mes analyses SEO exclusives !
          </p>

          {/* Formulaire Newsletter Substack */}
          <div style={{
            background: '#1a1a1a',
            border: '2px solid #f7c724',
            borderRadius: '12px',
            padding: '30px',
            marginTop: '20px'
          }}>
            <h3 style={{
              ...styles.title,
              fontSize: '20px',
              color: '#f7c724',
              marginTop: 0,
              marginBottom: '16px'
            }}>
              🎉 Recevez mes prochains outils gratuits !
            </h3>
            <p style={{
              ...styles.text,
              fontSize: '15px',
              color: '#ccc',
              marginBottom: '24px',
              lineHeight: '1.7'
            }}>
              Inscrivez-vous à ma newsletter pour être notifié en avant-première de mes nouveaux outils SEO.<br />
              <span style={{ color: '#999', fontSize: '14px' }}>Pas de spam - que du concret.</span>
            </p>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <iframe
                src="https://bastienamoruso.substack.com/embed"
                width="480"
                height="320"
                style={{
                  border: '1px solid #333',
                  background: 'white',
                  borderRadius: '8px',
                  maxWidth: '100%'
                }}
                frameBorder="0"
                scrolling="no"
                allow="forms"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ÉTAPE 1: Upload
  if (step === 1) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff' }}>
        {/* Header avec logo */}
        <div style={{
          background: '#000',
          borderBottom: '2px solid #f7c724',
          padding: '20px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div
            onClick={() => {
              setStep(1);
              setQueries([]);
              setClassifiedQueries([]);
              setAnalysis(null);
            }}
            style={{
              ...styles.title,
              fontSize: '48px',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            kamak_
          </div>
          <div>
            <h1 style={{ ...styles.title, margin: 0, fontSize: '28px', color: '#f7c724' }}>
              GSC INTENTION ANALYZER
            </h1>
            <p style={{ ...styles.text, margin: '4px 0 0 0', fontSize: '14px', color: '#999' }}>
              Découvrez les micro-intentions cachées dans votre trafic Search Console
            </p>
          </div>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
          {error && (
            <div style={{
              ...styles.card,
              background: '#2a1a1a',
              border: '1px solid #c00',
              marginBottom: '20px'
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Formulaire */}
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ ...styles.card, marginBottom: '20px' }}>
                <h2 style={{ ...styles.title, marginTop: 0, color: '#f7c724' }}>
                  📊 ÉTAPE 1 : CHARGEZ VOS DONNÉES
                </h2>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ ...styles.text, display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Marque <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex: Lock Academy, Nike, Apple, etc."
                    required
                    style={{
                      ...styles.text,
                      width: '100%',
                      padding: '12px',
                      background: '#0a0a0a',
                      border: brand ? '1px solid #333' : '1px solid #ef4444',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                  {!brand && (
                    <p style={{ ...styles.text, fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                      ⚠️ Ce champ est obligatoire pour filtrer les requêtes marque
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ ...styles.text, display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Secteur (optionnel)
                  </label>
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder="Ex: E-commerce, SaaS, etc."
                    style={{
                      ...styles.text,
                      width: '100%',
                      padding: '12px',
                      background: '#0a0a0a',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ ...styles.text, display: 'block', marginBottom: '12px', fontWeight: 500 }}>
                    📊 Import des données
                  </label>

                  {/* Bouton connexion GSC */}
                  <div style={{ marginBottom: '16px' }}>
                    <button
                      onClick={connectToGSC}
                      disabled={isLoadingGsc}
                      style={{
                        ...styles.button,
                        width: '100%',
                        padding: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        fontSize: '15px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoadingGsc) {
                          e.currentTarget.style.background = '#000';
                          e.currentTarget.style.color = '#f7c724';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoadingGsc) {
                          e.currentTarget.style.background = '#f7c724';
                          e.currentTarget.style.color = '#000';
                        }
                      }}
                    >
                      {isLoadingGsc ? (
                        '⏳ Connexion...'
                      ) : (
                        <>
                          <img
                            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAO4AAADUCAMAAACs0e/bAAAAq1BMVEX////Q0dLS09Tm5+hFjPVQUFBaWlp7e3vNzs8yhPTU1NCMrOY+ifb19vj09PTg4eJoaGhfX1/Y2tt6o+pLS0uEhIRFRUV0dHSWl5ezs7O6urtUVFXv8PDu7Oc/Pz9HR0fD0evw7udblvQ5OTmwv9yWseNQkfOht+Ccue+qwu6GrfHW3eosgvXDw8ObnJyNreZpnfOmv+7O2OpyovK6y+zF0uuMjIypqqqYmZo3DIJMAAAHdElEQVR4nO3d6WKiOhgGYIWJgLUuFLG2iu0sneliZ+vouf8rOyBFlnxJEGL9EvP+pCTwmBATVNrpHCFOb9I6PecYZ3aEXDrjnoSMnctTS+pk6MjiOsNTW8SJtdK4+L2JVh4Xu3enlcjF7U21MrmYve9aqVy83kwrl4vVu9dK5uL05lrZXIzeglY6F5+3qJXPxeYtaY/AxeWta4/BxeStaI/CxeOtap3ZWEJm1VqReGmtJaNaC6nXrp7XzJVRrUtVa8uotnUMV0a1hiuj2tYxXBnVGq6MalvHcGVUa7gyqm0dw5VRreHKqLZ1DFdGtSfiDkUZba4r6V4KCwlz2a3WuhkJC7XXjlxRulY1XWGZGmlS7ai9tqtQ2nrV0rb1qqZt51VP28arora5V01tU6+q2mZedbVNvCprD/eqrT3Uq7r2MK/62kO8Omjre/XQ1vXqoq3n1Udbx6uTVuzVSyvy6qTlePXT8rw6atlePbUsr65a2KuvFvLqrKW9emurXt21Za/+2qL3HLS59zy0mfdctKlXqLX6ysQSewV79Ptfv10okm9f+30BR8Dt/xwolZ8CL5/rPgw+KZXBA//a5HL7qmkTL7d9edz+hXLa2HvB83Jb1zv1uTeJ17B1+98VbNy4eb9zmpfHfVKT+9SQe1XlDjzPq7PtpBlcyeF6Dz/e7h6vSjjvU7zt7QkTWBLXe7tf2vZy+fwr3+z9Xsbb7KX9F8+oJofr/UlgSe7/Zttf7vbb8FznUrjeYyaLk1X8I9+2fDiJDYic1i1ol4/pHzy7kDcs3VkGd3BR4NrPXlpvcZutE7fUl+373R+KfTne9vlkwHI+hrvUiVumpR138FTiYhmapQxVn++BYanI/afTtfvJu8tt2WVa7OH5m/GpI2lWlct+ZA05eN5PMx6xNK4k7uAhtS2XPwuyP7s+vrz//fLhLFakLRGe/o3s58fSDZ2Xq7tk22c0bSuPm6z1Xqprn902RFiJXDViuIZruIarQAzXcA33zLh/4+mhennhcm124C/G4g+PxPmbEk+up3NpuIZruErGcA3XcE994s1iuIYr4l42joLcNt9pd8WLjeGmxv/Scq4/jGtTzwarn66Qu41CR/yaTMNorgHX7oUkcCyhdxqQcCJ+VZBzt18CEnN9YSeYJvt9ETYwbu4sImTHFfaChEtINFWYO7zdGXZckTflktWE/4BExFw7TAkpV+CdZvsGCzW5o4iQIpfvzbgkCHm7oeXae23G5Xr3XEJCTvti5Q7z099zed4CNyDqcScQl+OdFvcfq8bdrAjEZXuLXBIyZ5Q4ueuIwFymt8Ql0Vol7rCkLXFZ3jKXRIzhpSVGrltu3AoX9la4JNyC0yuMXEK4XLBMlUt6FtSfEXJvQgEXKkRxV1vIi5BbPXGaC5SiuOTWd2kvPu662rgAly5Gc+Pmpb34uJMarUuXo7nB2Ke96LijqHreILdakOaScG1RXnTc11U9bqUkwA02PuVFx6XOmsUtFwW48WBlVb3YuEBfZnFLZSFu0psrXmzcOd2XmdxiYYgbvPpVLzauA502i1soDXJnabmCFxsX6Mscbl4c4pLgvVzuRca1D+Tuy4Pc0LUqXmRcl5pSCbhZBSB3Nc/2yrzIuPODue81wNzXfcF3LzIuMMkQcdMq4Gt3kxdMvci4G/Cs+dxdHTB3Wii48yLjQu9DQm5SCcwtFUy8yLizRlyru4C5s1LB2KsH1/LhguNyQXehN3dG3fXBxYWv3bGI6/tjoBzwOvm4uODITILbORfsbwlcboqcC77vxgkdlwn212NockLK77soudD6Lz3zwgypDLCmEdi0pDSrwskF58zv5z5ZA2D/NWBhi3NmpFxwRZQ1cLShzv5mwn59stsZiLngejcHk9KQ5bsOd/f9ehcvF3z/LLTXLB+y/NcVf2fqbRcfd8saqzJC+F9q8Oc9wa4kuEbP9fndM86qd+PH/XjGu2jThDfU4bBxO6ImI8lXAbvXIb8fp6FHcnTc6xqOoBaWnmQg5Ip7c90AfRkft9OTxZ1AsxJ0XOrD+4ZZbYHD4eN2JHED6HAIuVspXnhJgZBLfzmjUcDDYeSuJQzO4RZcL2Lkdsat25d1vwcl1/7SlhtRSz/E3M68ZXcOGbc+kHJF60BBgJUfbm4HvrVYM7fMw2HlLlp05xXjwkXM7fiNh6vwhn1TGi23YzX0Rrxb8Hi5DduX17aoufmv4uonCKCb0WpwO0PuXWQgq4nLP5wM7hF/jH59UIeOqI/AjsE9ZrpBjXt17x2Z8D8nVIGbNHCtKziIpjWuHfzcju3UAIcz/hilDjceHIRT6BW8vFWTy/7Yd9+4wE1WwzVcwzVcwzVctbiLc+Iuzo07PCfukPc04yJ3MZKaE3ETSC3uqFvvWPXiAh3nA7j8XyrIunlDp3sa7u6o58PdHYfZvLpx3w/Kuno14+5/E3ke3ALmDLjFY+nPLR9Md271aMB4pQ+31pNxtOEynmu1OClX9NFYQ+6Cs9IZLhYwd3R8bnDLT3A4d7GoPMDrf6UIKRP9Hu9hAAAAAElFTkSuQmCC"
                            alt="Google Search Console"
                            style={{ height: '24px', width: 'auto' }}
                          />
                          Connecter Google Search Console
                        </>
                      )}
                    </button>
                    <p style={{ ...styles.text, fontSize: '12px', color: '#666', marginTop: '8px', textAlign: 'center' }}>
                      Import direct depuis GSC (12 derniers mois, jusqu'à 25 000 requêtes)
                    </p>
                  </div>

                  {/* Sélection du site GSC */}
                  {gscSites.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ ...styles.text, display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                        Sélectionnez votre site
                      </label>
                      <select
                        value={selectedSite}
                        onChange={(e) => setSelectedSite(e.target.value)}
                        style={{
                          ...styles.text,
                          width: '100%',
                          padding: '12px',
                          background: '#0a0a0a',
                          border: '1px solid #333',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '14px'
                        }}
                      >
                        <option value="">-- Choisissez un site --</option>
                        {gscSites.map((site) => (
                          <option key={site.siteUrl} value={site.siteUrl}>
                            {site.siteUrl}
                          </option>
                        ))}
                      </select>
                      {selectedSite && (
                        <button
                          onClick={fetchGSCData}
                          disabled={isLoadingGsc}
                          style={{
                            ...styles.button,
                            width: '100%',
                            padding: '12px',
                            marginTop: '12px'
                          }}
                          onMouseEnter={(e) => {
                            if (!isLoadingGsc) {
                              e.currentTarget.style.background = '#000';
                              e.currentTarget.style.color = '#f7c724';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isLoadingGsc) {
                              e.currentTarget.style.background = '#f7c724';
                              e.currentTarget.style.color = '#000';
                            }
                          }}
                        >
                          {isLoadingGsc ? '⏳ Chargement...' : '📥 Charger les données'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {queries.length > 0 && (
                  <div style={{
                    background: '#0f2a1a',
                    border: '1px solid #2a5a3a',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ ...styles.text }}>
                      ✅ <strong>{queries.length} requêtes</strong> chargées
                    </div>
                    <div style={{ ...styles.text, fontSize: '12px', marginTop: '5px', color: '#999' }}>
                      Total clics : {queries.reduce((sum, q) => sum + q.clicks, 0).toLocaleString()} |
                      Total impressions : {queries.reduce((sum, q) => sum + q.impressions, 0).toLocaleString()}
                    </div>
                  </div>
                )}

                <button
                  onClick={analyzeQueries}
                  disabled={queries.length === 0 || !brand || isLoading}
                  style={{
                    ...styles.button,
                    width: '100%',
                    padding: '16px',
                    opacity: (queries.length === 0 || !brand) ? 0.5 : 1,
                    cursor: (queries.length === 0 || !brand) ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (queries.length > 0 && brand) {
                      e.currentTarget.style.background = '#000';
                      e.currentTarget.style.color = '#f7c724';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (queries.length > 0 && brand) {
                      e.currentTarget.style.background = '#f7c724';
                      e.currentTarget.style.color = '#000';
                    }
                  }}
                >
                  {isLoading ? '🔄 ANALYSE EN COURS...' : '🚀 ANALYSER LES INTENTIONS'}
                </button>
              </div>
          </div>
        </div>

        <Footer />
      </div>
    );
  }

  // ÉTAPE 2 : Résultats
  if (step === 2 && analysis) {
    const matrix = generateMatrix();

    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff' }}>
        {/* Header avec logo */}
        <div style={{
          background: '#000',
          borderBottom: '2px solid #f7c724',
          padding: '20px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              onClick={() => {
                setStep(1);
                setQueries([]);
                setClassifiedQueries([]);
                setAnalysis(null);
              }}
              style={{
                ...styles.title,
                fontSize: '48px',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              kamak_
            </div>
            <div>
              <h1 style={{ ...styles.title, margin: 0, fontSize: '28px', color: '#f7c724' }}>
                ✅ ANALYSE TERMINÉE
              </h1>
              <p style={{ ...styles.text, margin: '4px 0 0 0', fontSize: '14px', color: '#999' }}>
                {classifiedQueries.length} requêtes • {analysis.intentions.length} intentions
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setStep(1);
              setQueries([]);
              setClassifiedQueries([]);
              setAnalysis(null);
            }}
            style={styles.button}
          >
            ← NOUVELLE ANALYSE
          </button>
        </div>

        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '40px 20px' }}>
          {/* Insights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <div style={{ ...styles.card, borderLeft: '4px solid #22c55e' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎯</div>
              <h3 style={{ ...styles.title, margin: '0 0 15px 0', fontSize: '14px', color: '#22c55e' }}>
                OPPORTUNITÉ PRINCIPALE
              </h3>
              {formatInsight(analysis.insights.biggest_opportunity)}
            </div>
            <div style={{ ...styles.card, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
              <h3 style={{ ...styles.title, margin: '0 0 15px 0', fontSize: '14px', color: '#ef4444' }}>
                FRICTION PRINCIPALE
              </h3>
              {formatInsight(analysis.insights.biggest_friction)}
            </div>
            <div style={{ ...styles.card, borderLeft: '4px solid #f7c724' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚡</div>
              <h3 style={{ ...styles.title, margin: '0 0 15px 0', fontSize: '14px', color: '#f7c724' }}>
                QUICK WIN
              </h3>
              {formatInsight(analysis.insights.quick_win)}
            </div>
          </div>

          {/* Requêtes marque identifiées */}
          {brandQueries.length > 0 && (
            <div style={{ ...styles.card, marginBottom: '30px', borderLeft: '4px solid #0edd89' }}>
              <h3 style={{ ...styles.title, marginTop: 0, color: '#0edd89', fontSize: '18px' }}>
                🏷️ REQUÊTES MARQUE IDENTIFIÉES
              </h3>
              <p style={{ ...styles.text, color: '#ccc', fontSize: '14px', marginBottom: '15px' }}>
                <strong>{brandQueries.length} requête{brandQueries.length > 1 ? 's' : ''}</strong> contenant "{brand}" ont été exclues de l'analyse des intentions.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Total clics</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#0edd89' }}>
                    {brandQueries.reduce((sum, q) => sum + q.clicks, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Total impressions</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#0edd89' }}>
                    {brandQueries.reduce((sum, q) => sum + q.impressions, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>CTR moyen</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#0edd89' }}>
                    {((brandQueries.reduce((sum, q) => sum + q.clicks, 0) / brandQueries.reduce((sum, q) => sum + q.impressions, 0)) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Position moyenne</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#0edd89' }}>
                    {(brandQueries.reduce((sum, q) => sum + q.position, 0) / brandQueries.length).toFixed(1)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowBrandQueries(!showBrandQueries)}
                style={{
                  ...styles.button,
                  padding: '10px 20px',
                  fontSize: '13px'
                }}
              >
                {showBrandQueries ? '▼ Masquer les requêtes' : '▶ Voir toutes les requêtes'}
              </button>

              {showBrandQueries && (
                <div style={{ marginTop: '15px', maxHeight: '400px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'left' }}>
                          Requête
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          Position
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          CTR
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          Clics
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          Impressions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {brandQueries.sort((a, b) => b.clicks - a.clicks).map((q, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#0a0a0a' : '#121212' }}>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333' }}>
                            {q.query}
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {q.position.toFixed(1)}
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {(q.ctr * 100).toFixed(1)}%
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {q.clicks}
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {q.impressions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Détails par intention (accordéon) */}
          <div style={{ ...styles.card, marginBottom: '30px' }}>
            <h2 style={{ ...styles.title, marginTop: 0, color: '#f7c724' }}>
              📊 DÉTAILS PAR INTENTION
            </h2>
            {analysis.intentions.map((intention, idx) => {
              const details = getIntentionDetails(intention.nom);
              const isExpanded = expandedIntention === intention.nom;

              // Recalculer le CTR RÉEL côté client (total clics / total impressions)
              const realCTR = details.totalImpressions > 0
                ? (details.totalClicks / details.totalImpressions)
                : 0;

              return (
                <div key={idx} style={{
                  background: '#0a0a0a',
                  border: `1px solid ${COLORS[idx % COLORS.length]}`,
                  borderRadius: '8px',
                  marginBottom: '12px',
                  overflow: 'hidden'
                }}>
                  <div
                    onClick={() => setExpandedIntention(isExpanded ? null : intention.nom)}
                    style={{
                      padding: '16px',
                      cursor: 'pointer',
                      borderLeft: `4px solid ${COLORS[idx % COLORS.length]}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isExpanded ? '#1a1a1a' : 'transparent'
                    }}
                  >
                    <div>
                      <strong style={{ ...styles.title, color: COLORS[idx % COLORS.length], fontSize: '16px' }}>
                        {intention.nom}
                      </strong>
                      <div style={{ ...styles.text, fontSize: '12px', color: '#999', marginTop: '4px' }}>
                        {intention.description}
                      </div>
                      <div style={{ ...styles.text, fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        📊 {intention.volume} req • CTR: {(realCTR * 100).toFixed(1)}% • Pos: {intention.position_moyenne.toFixed(1)}
                      </div>
                    </div>
                    <div style={{ fontSize: '20px' }}>{isExpanded ? '▼' : '▶'}</div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '16px', borderTop: '1px solid #333' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                        <div>
                          <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Volume total</div>
                          <div style={{ ...styles.title, fontSize: '20px', color: '#f7c724' }}>
                            {details.totalClicks} clics / {details.totalImpressions} imp
                          </div>
                        </div>
                        <div>
                          <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Distribution positions</div>
                          <div style={{ ...styles.text, fontSize: '12px', marginTop: '4px' }}>
                            P1-3: {details.positionDistribution['P1-3']} |
                            P4-7: {details.positionDistribution['P4-7']} |
                            P8-10: {details.positionDistribution['P8-10']} |
                            P11+: {details.positionDistribution['P11+']}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ ...styles.text, fontSize: '12px', color: '#999', marginBottom: '8px' }}>
                          Top 5 requêtes (par clics)
                        </div>
                        {details.top5.map((q, i) => (
                          <div key={i} style={{
                            ...styles.text,
                            fontSize: '11px',
                            padding: '8px',
                            background: i % 2 === 0 ? '#0a0a0a' : '#1a1a1a',
                            borderRadius: '4px',
                            marginBottom: '4px'
                          }}>
                            <strong>"{q.query}"</strong> |
                            Pos: {q.position.toFixed(1)} |
                            CTR: {(q.ctr * 100).toFixed(1)}% |
                            Clics: {q.clicks}
                          </div>
                        ))}

                        {/* Bouton "Voir tous les mots-clés" */}
                        <button
                          onClick={() => setShowAllKeywordsForIntention(
                            showAllKeywordsForIntention === intention.nom ? null : intention.nom
                          )}
                          style={{
                            ...styles.button,
                            marginTop: '12px',
                            padding: '10px 16px',
                            fontSize: '12px',
                            width: '100%'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#000';
                            e.currentTarget.style.color = '#f7c724';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f7c724';
                            e.currentTarget.style.color = '#000';
                          }}
                        >
                          {showAllKeywordsForIntention === intention.nom
                            ? '▼ Masquer tous les mots-clés'
                            : `▶ Voir tous les ${details.allQueries?.length || 0} mots-clés`}
                        </button>

                        {/* Table avec tous les mots-clés */}
                        {showAllKeywordsForIntention === intention.nom && (
                          <div style={{ marginTop: '15px', maxHeight: '400px', overflowY: 'auto', border: '1px solid #333', borderRadius: '6px' }}>
                            <table style={{ width: '100%', fontSize: '11px' }}>
                              <thead style={{ position: 'sticky', top: 0, background: '#1a1a1a', zIndex: 1 }}>
                                <tr>
                                  <th style={{ ...styles.text, padding: '10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Requête</th>
                                  <th style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>Position</th>
                                  <th style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>Clics</th>
                                  <th style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>Impressions</th>
                                  <th style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>CTR</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(details.allQueries || [])
                                  .sort((a, b) => b.clicks - a.clicks)
                                  .map((q, i) => (
                                    <tr key={i} style={{ background: i % 2 === 0 ? '#0a0a0a' : '#121212' }}>
                                      <td style={{ ...styles.text, padding: '8px', borderBottom: '1px solid #222' }}>
                                        {q.query}
                                      </td>
                                      <td style={{ ...styles.text, padding: '8px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                        {q.position.toFixed(1)}
                                      </td>
                                      <td style={{ ...styles.text, padding: '8px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                        {q.clicks}
                                      </td>
                                      <td style={{ ...styles.text, padding: '8px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                        {q.impressions}
                                      </td>
                                      <td style={{ ...styles.text, padding: '8px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                        {(q.ctr * 100).toFixed(1)}%
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {(() => {
                        // Utiliser les quick wins optimisés du Prompt 2 si disponibles
                        const optimizedQuickWins = analysis.quick_wins_par_intention?.find(
                          qw => qw.intention === intention.nom
                        );

                        // Fallback : ancienne logique si quick_wins_par_intention n'existe pas
                        const quickWinsToDisplay = optimizedQuickWins?.quick_wins || details.quickWins;

                        if (quickWinsToDisplay.length === 0) return null;

                        return (
                          <div>
                            <div style={{ ...styles.text, fontSize: '12px', color: '#f7c724', marginBottom: '8px' }}>
                              ⚡ Quick wins optimisés ({quickWinsToDisplay.length} requêtes en P5-20)
                            </div>
                            {quickWinsToDisplay.map((q, i) => (
                              <div key={i} style={{
                                ...styles.text,
                                fontSize: '11px',
                                padding: '10px',
                                background: '#2a1a0a',
                                borderRadius: '6px',
                                marginBottom: '6px',
                                borderLeft: '3px solid #f7c724'
                              }}>
                                <div style={{ marginBottom: '4px' }}>
                                  <strong style={{ color: '#fdf13e' }}>"{q.query}"</strong>
                                </div>
                                <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>
                                  📊 Pos: {q.position.toFixed(1)} |
                                  Clics: {q.clicks} |
                                  Imp: {q.impressions} |
                                  CTR: {(q.ctr * 100).toFixed(1)}%
                                </div>
                                {'action' in q && q.action && (
                                  <div style={{ color: '#0edd89', fontSize: '10px', fontStyle: 'italic' }}>
                                    💡 {q.action}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Matrice interactive */}
          <div style={{ ...styles.card, marginBottom: '30px' }}>
            <h2 style={{ ...styles.title, marginTop: 0, color: '#f7c724' }}>
              🎯 MATRICE POSITION × INTENTION (CTR %)
            </h2>
            <p style={{ ...styles.text, color: '#999', fontSize: '14px', marginBottom: '12px' }}>
              Cliquez sur une cellule pour voir les requêtes détaillées
            </p>
            <div style={{
              background: '#2a1a0a',
              border: '1px solid #f7c724',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px'
            }}>
              <div style={{ ...styles.text, fontSize: '13px', color: '#fdf13e', marginBottom: '8px' }}>
                ⚠️ <strong>Disclaimer & Méthodologie</strong>
              </div>
              <div style={{ ...styles.text, fontSize: '12px', color: '#ccc', lineHeight: '1.6' }}>
                <strong>Limitations des données GSC :</strong><br />
                • Les positions moyennes <strong>ne reflètent pas l'ensemble de la SERP</strong> (excluent featured snippets, PAA, local pack, images, etc.)<br />
                • Ces données constituent un <strong>bon premier indicateur</strong> pour estimer le trafic potentiel<br />
                • Pour une analyse complète, croisez avec des données externes (Semrush, Ahrefs, etc.)<br />
                <br />
                <strong>Affichage des CTR dans la matrice :</strong><br />
                • <strong>CTR visible</strong> : Cellules avec ≥100 impressions OU ≥10 clics (échantillon statistiquement fiable)<br />
                • <strong>"N/A" affiché</strong> : Cellules avec moins de 100 impressions ET moins de 10 clics (échantillon trop faible, CTR non représentatif)<br />
                • Le nombre de requêtes par cellule est toujours affiché, même si le CTR est marqué "N/A"<br />
                <br />
                <strong>Note :</strong> Le nombre total de requêtes dans la matrice peut différer du total indiqué dans "Détails par intention" si certaines requêtes ont des positions invalides ou manquantes.
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{
                      ...styles.title,
                      padding: '12px',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      textAlign: 'left',
                      color: '#f7c724'
                    }}>
                      Position
                    </th>
                    {analysis.intentions.map((intention, idx) => (
                      <th key={idx} style={{
                        ...styles.title,
                        padding: '12px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        textAlign: 'center',
                        color: COLORS[idx % COLORS.length],
                        fontSize: '11px'
                      }}>
                        {intention.nom}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, rowIdx) => (
                    <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? '#0a0a0a' : '#121212' }}>
                      <td style={{
                        ...styles.title,
                        padding: '12px',
                        border: '1px solid #333',
                        fontWeight: 600,
                        color: '#f7c724'
                      }}>
                        {row.position}
                      </td>
                      {analysis.intentions.map((intention, colIdx) => {
                        const cellData = row[intention.nom];
                        const ctrPercent = (cellData.ctr * 100).toFixed(1);
                        const isLowData = cellData.count > 0 && cellData.count < 5;

                        return (
                          <td
                            key={colIdx}
                            onClick={() => {
                              if (cellData.count > 0) {
                                setSelectedCell({
                                  intention: intention.nom,
                                  posGroup: row.position,
                                  queries: cellData.queries
                                });
                              }
                            }}
                            style={{
                              ...styles.text,
                              padding: '12px',
                              border: '1px solid #333',
                              textAlign: 'center',
                              cursor: cellData.count > 0 ? 'pointer' : 'default',
                              background: cellData.count > 0
                                ? `rgba(247, 199, 36, ${Math.min(cellData.ctr * 2, 0.3)})`
                                : '#1a1a1a',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (cellData.count > 0) {
                                e.currentTarget.style.background = `rgba(247, 199, 36, ${Math.min(cellData.ctr * 2, 0.5)})`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (cellData.count > 0) {
                                e.currentTarget.style.background = `rgba(247, 199, 36, ${Math.min(cellData.ctr * 2, 0.3)})`;
                              }
                            }}
                          >
                            {cellData.count > 0 ? (
                              cellData.isReliable ? (
                                <>
                                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{ctrPercent}%</div>
                                  <div style={{ fontSize: '10px', color: '#999' }}>({cellData.count} req)</div>
                                </>
                              ) : (
                                <>
                                  <div style={{ fontWeight: 600, fontSize: '11px', color: '#666' }}>N/A</div>
                                  <div style={{ fontSize: '10px', color: '#666' }}>
                                    ({cellData.count} req)
                                    <div style={{ fontSize: '9px' }}>échantillon faible</div>
                                  </div>
                                </>
                              )
                            ) : (
                              <span style={{ color: '#666' }}>-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal drill-down */}
          {selectedCell && (
            <div
              onClick={() => setSelectedCell(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px'
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  ...styles.card,
                  maxWidth: '900px',
                  width: '100%',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  border: '2px solid #f7c724'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ ...styles.title, margin: 0, color: '#f7c724' }}>
                      {selectedCell.intention} • {selectedCell.posGroup}
                    </h2>
                    <p style={{ ...styles.text, margin: '4px 0 0 0', fontSize: '14px', color: '#999' }}>
                      {selectedCell.queries.length} requêtes
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCell(null)}
                    style={{
                      ...styles.button,
                      padding: '8px 16px'
                    }}
                  >
                    ✕ Fermer
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'left' }}>
                          Requête
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          Position
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          CTR
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          Clics
                        </th>
                        <th style={{ ...styles.title, padding: '10px', background: '#1a1a1a', border: '1px solid #333', textAlign: 'center' }}>
                          Impressions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCell.queries.map((q, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#0a0a0a' : '#121212' }}>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333' }}>
                            {q.query}
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {q.position.toFixed(1)}
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {(q.ctr * 100).toFixed(1)}%
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {q.clicks}
                          </td>
                          <td style={{ ...styles.text, padding: '10px', border: '1px solid #333', textAlign: 'center' }}>
                            {q.impressions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section Cannibalisations */}
          <div style={{
            ...styles.card,
            marginBottom: '30px',
            borderLeft: cannibalisations.length > 0 ? '4px solid #ef4444' : '4px solid #0edd89'
          }}>
            <h3 style={{
              ...styles.title,
              marginTop: 0,
              color: cannibalisations.length > 0 ? '#ef4444' : '#0edd89',
              fontSize: '18px'
            }}>
              {cannibalisations.length > 0 ? '⚠️ DANGERS POTENTIELS DE CANNIBALISATION' : '✅ ANALYSE DE CANNIBALISATION'}
            </h3>

            {cannibalisations.length > 0 ? (
              <>
                <p style={{ ...styles.text, color: '#ccc', fontSize: '14px', marginBottom: '10px' }}>
                  <strong>Top {cannibalisations.length} requête{cannibalisations.length > 1 ? 's' : ''} les plus impactantes</strong> pour lesquelles plusieurs URLs de votre site sont en compétition dans le top 20.
                  Cliquez sur chaque requête pour voir les détails. Cela peut diluer votre autorité et créer de l'instabilité dans les positions.
                </p>
                <div style={{
                  background: '#2a1a1a',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '15px',
                  fontSize: '12px',
                  lineHeight: '1.6'
                }}>
                  <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '6px' }}>
                    🔍 Méthodologie de détection :
                  </div>
                  <div style={{ color: '#ccc' }}>
                    • <strong>≥5% des impressions</strong> de la requête par URL (part significative)<br />
                    • <strong>Position 1-20</strong> sur Google (compétition visible)<br />
                    • <strong>2+ URLs</strong> captant chacune ≥5% des impressions<br />
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                      → Les données sont présentées pour que vous puissiez arbitrer selon votre contexte
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                background: '#0f2a1a',
                border: '1px solid #0edd89',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '15px'
              }}>
                <p style={{ ...styles.text, color: '#0edd89', fontSize: '14px', marginBottom: '8px', fontWeight: 'bold' }}>
                  🎉 Aucune cannibalisation détectée !
                </p>
                <p style={{ ...styles.text, color: '#ccc', fontSize: '13px', lineHeight: '1.6' }}>
                  Excellente nouvelle : aucune requête n'a plusieurs URLs en compétition dans le top 20.
                  Cela signifie que votre architecture de contenu est bien organisée et que vous ne diluez pas votre autorité
                  en faisant concourir plusieurs pages sur les mêmes intentions de recherche.
                </p>
              </div>
            )}

            {cannibalisations.length > 0 && (
              <>

              {/* Métriques globales */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Requêtes concernées</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#ef4444' }}>
                    {cannibalisations.length}
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>URLs en compétition</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#ef4444' }}>
                    {cannibalisations.reduce((sum, c) => sum + (c.urlsCount || c.pages.length), 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Impressions totales</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#ef4444' }}>
                    {cannibalisations.reduce((sum, c) => sum + c.totalImpressions, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Clics totaux</div>
                  <div style={{ ...styles.title, fontSize: '20px', color: '#ef4444' }}>
                    {cannibalisations.reduce((sum, c) => sum + c.totalClicks, 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Liste des cannibalisations (accordéon) - Query-centric */}
              <div style={{ marginTop: '20px' }}>
                {cannibalisations.map((cannibal, idx) => {
                  const isExpanded = expandedCannibalisation === cannibal.query;
                  const urlsCount = cannibal.urlsCount || cannibal.pages.length;

                  return (
                    <div key={idx} style={{
                      background: '#1a0a0a',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      overflow: 'hidden'
                    }}>
                      <div
                        onClick={() => setExpandedCannibalisation(isExpanded ? null : cannibal.query)}
                        style={{
                          padding: '16px',
                          cursor: 'pointer',
                          borderLeft: '4px solid #ef4444',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: isExpanded ? '#2a1a1a' : 'transparent'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong style={{ ...styles.title, color: '#fdf13e', fontSize: '14px', fontStyle: 'italic' }}>
                            "{cannibal.query}"
                          </strong>
                          <div style={{ ...styles.text, fontSize: '11px', color: '#999', marginTop: '4px' }}>
                            {urlsCount} URL{urlsCount > 1 ? 's' : ''} en compétition •
                            {cannibal.totalClicks.toLocaleString()} clics •
                            {cannibal.totalImpressions.toLocaleString()} impressions •
                            Position moy: {cannibal.avgPosition.toFixed(1)}
                          </div>
                        </div>
                        <div style={{ fontSize: '20px', marginLeft: '16px' }}>
                          {isExpanded ? '▼' : '▶'}
                        </div>
                      </div>

                      {/* Détails des URLs en compétition */}
                      {isExpanded && (
                        <div style={{ padding: '16px', borderTop: '1px solid #333' }}>
                          <div style={{ ...styles.text, fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
                            🔍 URLs détectées en compétition :
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ background: '#1a1a1a' }}>
                                <th style={{ ...styles.title, padding: '10px', textAlign: 'left', borderBottom: '1px solid #333' }}>
                                  URL
                                </th>
                                <th style={{ ...styles.title, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>
                                  Position
                                </th>
                                <th style={{ ...styles.title, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>
                                  Clics
                                </th>
                                <th style={{ ...styles.title, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>
                                  Impressions
                                </th>
                                <th style={{ ...styles.title, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>
                                  % Impr.
                                </th>
                                <th style={{ ...styles.title, padding: '10px', textAlign: 'center', borderBottom: '1px solid #333' }}>
                                  CTR
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {cannibal.pages
                                .sort((a, b) => b.impressionsPercentage - a.impressionsPercentage)
                                .map((page, pageIdx) => (
                                  <tr key={pageIdx} style={{ background: pageIdx % 2 === 0 ? '#0a0a0a' : '#121212' }}>
                                    <td style={{
                                      ...styles.text,
                                      padding: '10px',
                                      borderBottom: '1px solid #222',
                                      maxWidth: '300px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      <a
                                        href={page.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          color: pageIdx === 0 ? '#0edd89' : '#ef4444',
                                          textDecoration: 'none',
                                          transition: 'opacity 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                      >
                                        {page.url}
                                      </a>
                                    </td>
                                    <td style={{
                                      ...styles.text,
                                      padding: '10px',
                                      textAlign: 'center',
                                      borderBottom: '1px solid #222',
                                      fontWeight: pageIdx === 0 ? 'bold' : 'normal',
                                      color: pageIdx === 0 ? '#0edd89' : 'inherit'
                                    }}>
                                      {page.position.toFixed(1)}
                                      {pageIdx === 0 && ' 👑'}
                                    </td>
                                    <td style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                      {page.clicks}
                                    </td>
                                    <td style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                      {page.impressions}
                                    </td>
                                    <td style={{
                                      ...styles.text,
                                      padding: '10px',
                                      textAlign: 'center',
                                      borderBottom: '1px solid #222',
                                      fontWeight: 'bold',
                                      color: '#ef4444'
                                    }}>
                                      {page.impressionsPercentage.toFixed(1)}%
                                    </td>
                                    <td style={{ ...styles.text, padding: '10px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                                      {(page.ctr * 100).toFixed(1)}%
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                          <div style={{
                            ...styles.text,
                            fontSize: '11px',
                            color: '#666',
                            marginTop: '12px',
                            padding: '10px',
                            background: '#0a0a0a',
                            borderRadius: '6px',
                            borderLeft: '3px solid #f7c724'
                          }}>
                            💡 <strong style={{ color: '#f7c724' }}>Recommandation :</strong> Consolidez le contenu sur l'URL leader (👑)
                            et redirigez ou différenciez les autres URLs pour éviter la compétition interne.
                            Le % d'impressions indique la part de visibilité de chaque URL.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>

          {/* SECTION : PROBLÈMES TECHNIQUES D'URL */}
          <div style={{
            background: '#1a1a1a',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            borderLeft: technicalIssues.length > 0 ? '4px solid #fb923c' : '4px solid #0edd89'
          }}>
            <h3 style={{
              ...styles.title,
              marginTop: 0,
              color: technicalIssues.length > 0 ? '#fb923c' : '#0edd89',
              fontSize: '18px'
            }}>
              {technicalIssues.length > 0 ? '🔧 PROBLÈMES TECHNIQUES D\'URL' : '✅ CONFIGURATION TECHNIQUE'}
            </h3>

            {technicalIssues.length > 0 ? (
              <>
                <p style={{ ...styles.text, color: '#ccc', fontSize: '14px', marginBottom: '10px' }}>
                  <strong>Top {technicalIssues.length} problème{technicalIssues.length > 1 ? 's' : ''} technique{technicalIssues.length > 1 ? 's' : ''}</strong> détecté{technicalIssues.length > 1 ? 's' : ''} : variantes d'URL pour la même page (www/non-www, trailing slash, http/https).
                  Ces problèmes indiquent l'absence de <strong>redirections 301</strong> et causent une dilution de votre autorité SEO.
                </p>
                <div style={{
                  background: '#2a1a1a',
                  border: '1px solid #fb923c',
                  borderRadius: '6px',
                  padding: '15px',
                  marginBottom: '15px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                    <div>
                      <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Problèmes détectés</div>
                      <div style={{ ...styles.title, fontSize: '20px', color: '#fb923c' }}>
                        {technicalIssues.length}
                      </div>
                    </div>
                    <div>
                      <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Variantes d'URL</div>
                      <div style={{ ...styles.title, fontSize: '20px', color: '#fb923c' }}>
                        {technicalIssues.reduce((sum, i) => sum + i.variantsCount, 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Impressions affectées</div>
                      <div style={{ ...styles.title, fontSize: '20px', color: '#fb923c' }}>
                        {technicalIssues.reduce((sum, i) => sum + i.totalImpressions, 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ ...styles.text, fontSize: '12px', color: '#999' }}>Clics affectés</div>
                      <div style={{ ...styles.title, fontSize: '20px', color: '#fb923c' }}>
                        {technicalIssues.reduce((sum, i) => sum + i.totalClicks, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Liste des problèmes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {technicalIssues.map((issue, idx) => {
                    const isExpanded = expandedTechnicalIssue === issue.query;

                    return (
                      <div key={idx} style={{
                        background: '#1a1a1a',
                        border: '1px solid #fb923c',
                        borderRadius: '6px',
                        overflow: 'hidden'
                      }}>
                        <div onClick={() => setExpandedTechnicalIssue(isExpanded ? null : issue.query)} style={{
                          padding: '15px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          transition: 'background 0.2s',
                          background: isExpanded ? '#2a2020' : 'transparent'
                        }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ ...styles.title, color: '#fdf13e', fontSize: '14px', fontStyle: 'italic' }}>
                              "{issue.query}"
                            </strong>
                            <div style={{ ...styles.text, fontSize: '11px', color: '#999', marginTop: '4px' }}>
                              {issue.variantsCount} variante{issue.variantsCount > 1 ? 's' : ''} •
                              {issue.issueTypes.map(t => {
                                if (t === 'www/non-www') return ' www/non-www';
                                if (t === 'trailing-slash') return ' trailing slash';
                                if (t === 'http-https') return ' http/https';
                                return '';
                              }).join(' •')} •
                              {issue.totalClicks.toLocaleString()} clics •
                              {issue.totalImpressions.toLocaleString()} impressions
                            </div>
                          </div>
                          <div style={{ ...styles.text, fontSize: '18px', color: '#fb923c' }}>
                            {isExpanded ? '▲' : '▼'}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{
                            padding: '15px',
                            borderTop: '1px solid #fb923c',
                            background: '#0f0f0f'
                          }}>
                            <div style={{ ...styles.text, fontSize: '12px', color: '#fb923c', marginBottom: '10px' }}>
                              🔧 <strong>Variantes d'URL détectées :</strong>
                            </div>
                            <table style={{
                              width: '100%',
                              borderCollapse: 'collapse',
                              fontSize: '12px',
                              color: '#ccc'
                            }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #444' }}>
                                  <th style={{ textAlign: 'left', padding: '8px', color: '#999' }}>URL</th>
                                  <th style={{ textAlign: 'center', padding: '8px', color: '#999' }}>Position</th>
                                  <th style={{ textAlign: 'center', padding: '8px', color: '#999' }}>Clics</th>
                                  <th style={{ textAlign: 'center', padding: '8px', color: '#999' }}>Impressions</th>
                                  <th style={{ textAlign: 'center', padding: '8px', color: '#999' }}>% Impr.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {issue.variants.map((variant, variantIdx) => (
                                  <tr key={variantIdx} style={{ borderBottom: '1px solid #333' }}>
                                    <td style={{ padding: '8px', wordBreak: 'break-all' }}>
                                      <a href={variant.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fb923c', textDecoration: 'none' }}>
                                        {variant.url}
                                      </a>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '8px' }}>
                                      {variant.position.toFixed(1)} {variantIdx === 0 && ' 👑'}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '8px' }}>{variant.clicks}</td>
                                    <td style={{ textAlign: 'center', padding: '8px' }}>{variant.impressions}</td>
                                    <td style={{ textAlign: 'center', padding: '8px' }}>{variant.impressionsPercentage.toFixed(1)}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ ...styles.text, fontSize: '12px', color: '#fb923c', marginTop: '15px', padding: '10px', background: '#2a1a1a', borderRadius: '4px', borderLeft: '3px solid #fb923c' }}>
                              💡 <strong>Recommandation :</strong> Choisissez une URL canonique (👑) et mettez en place des <strong>redirections 301</strong> depuis toutes les variantes vers l'URL choisie.
                              Cela consolidera votre autorité SEO et évitera la dilution de vos signaux.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p style={{ ...styles.text, color: '#0edd89', fontSize: '14px', margin: 0 }}>
                ✅ Aucun problème technique d'URL détecté. Vos redirections semblent correctement configurées.
              </p>
            )}
          </div>
        </div>

        {/* Popup Email Substack */}
        {showEmailPopup && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px'
            }}
            onClick={() => setShowEmailPopup(false)}
          >
            <div
              style={{
                background: '#1a1a1a',
                border: '2px solid #f7c724',
                borderRadius: '12px',
                padding: '30px',
                maxWidth: '540px',
                width: '100%',
                position: 'relative',
                boxShadow: '0 8px 32px rgba(247, 199, 36, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowEmailPopup(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'transparent',
                  border: 'none',
                  color: '#999',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '5px 10px',
                  lineHeight: 1
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#999'}
              >
                ×
              </button>

              <h3 style={{
                ...styles.title,
                color: '#f7c724',
                fontSize: '22px',
                marginTop: 0,
                marginBottom: '15px',
                textAlign: 'center'
              }}>
                🎉 Envie de plus d'outils SEO ?
              </h3>

              <p style={{
                ...styles.text,
                color: '#ccc',
                fontSize: '15px',
                marginBottom: '25px',
                textAlign: 'center'
              }}>
                Reçois mes prochains outils gratuits en avant-première<br />
                <span style={{ color: '#999', fontSize: '13px' }}>Pas de spam - que du concret</span>
              </p>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <iframe
                  src="https://bastienamoruso.substack.com/embed"
                  width="480"
                  height="320"
                  style={{
                    border: '1px solid #333',
                    background: 'white',
                    borderRadius: '8px',
                    maxWidth: '100%'
                  }}
                  frameBorder="0"
                  scrolling="no"
                  allow="forms"
                  sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>
    );
  }

  return null;
}
