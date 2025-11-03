'use client';

import React, { useState } from 'react';
import Papa from 'papaparse';
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

  // Afficher la popup 15 secondes après les résultats
  React.useEffect(() => {
    if (step === 2 && analysis) {
      const timer = setTimeout(() => {
        setShowEmailPopup(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [step, analysis]);

  // Upload CSV
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const firstRow = results.data[0] as any;
          const columns = firstRow ? Object.keys(firstRow) : [];
          console.log('🔍 Colonnes détectées:', columns);

          const parsed = results.data.map((row: any) => {
            const query = row['Requêtes les plus fréquentes'] || row['Requêtes'] || row['Top queries'] || row['Requête'] || row['Query'] || row['query'] || '';
            const clicks = parseFloat(row['Clicks'] || row['Clics'] || row['clicks'] || '0');
            const impressions = parseFloat(row['Impressions'] || row['impressions'] || '0');

            // Parser CTR en gérant le symbole %
            const ctrRaw = row['CTR'] || row['ctr'] || '0';
            let ctr = 0;
            if (typeof ctrRaw === 'string' && ctrRaw.includes('%')) {
              // Si contient %, c'est déjà un pourcentage (ex: "0.22%" ou "22%")
              ctr = parseFloat(ctrRaw.replace('%', '').replace(',', '.')) / 100;
            } else {
              // Sinon, c'est un décimal (ex: 0.22 pour 22% ou 0.0022 pour 0.22%)
              const ctrValue = parseFloat(String(ctrRaw).replace(',', '.'));
              ctr = ctrValue > 1 ? ctrValue / 100 : ctrValue;
            }

            const position = parseFloat(row['Position'] || row['position'] || '0');

            return {
              query: query.trim(),
              clicks,
              impressions,
              ctr,
              position
            };
          }).filter(q => q.query && q.impressions > 0);

          if (parsed.length === 0) {
            setError(`Aucune donnée valide trouvée. Colonnes : ${columns.join(', ')}`);
            return;
          }

          setQueries(parsed);
          setError('');
          console.log(`✅ ${parsed.length} requêtes chargées`);
        } catch (err) {
          setError('Erreur parsing CSV : ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      },
      error: (err) => {
        setError('Erreur lecture fichier : ' + err.message);
      }
    });
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

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries, brand, sector })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze queries');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setClassifiedQueries(data.classifiedQueries);
      setBrandQueries(data.brandQueries || []);
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
      background: '#000',
      color: '#f7c724',
      border: '2px solid #f7c724',
      padding: '12px 24px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 600,
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
          // Regex pour détecter les citations
          const parts = sentence.split(/("([^"]*)"|"([^"]*)")/g);

          return (
            <div key={idx} style={{ marginBottom: idx < sentences.length - 1 ? '12px' : 0 }}>
              <span style={{ ...styles.text, fontSize: '14px' }}>
                {parts.map((part, partIdx) => {
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

          {/* Layout 2 colonnes : Formulaire + GIF Tutoriel */}
          <div style={{
            display: 'flex',
            gap: '40px',
            alignItems: 'flex-start',
            flexWrap: 'wrap'
          }}>

            {/* Colonne gauche : Formulaire */}
            <div style={{ flex: '1 1 500px', minWidth: '320px' }}>
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
                  <label style={{ ...styles.text, display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    📁 Export CSV Google Search Console
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    style={{
                      ...styles.text,
                      width: '100%',
                      padding: '12px',
                      background: '#0a0a0a',
                      border: '2px dashed #333',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#999'
                    }}
                  />
                  <p style={{ ...styles.text, fontSize: '12px', color: '#666', marginTop: '8px' }}>
                    💡 Exportez depuis GSC : Performance → Requêtes → Exporter
                  </p>
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
                      e.currentTarget.style.background = '#f7c724';
                      e.currentTarget.style.color = '#000';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (queries.length > 0 && brand) {
                      e.currentTarget.style.background = '#000';
                      e.currentTarget.style.color = '#f7c724';
                    }
                  }}
                >
                  {isLoading ? '🔄 ANALYSE EN COURS...' : '🚀 ANALYSER LES INTENTIONS'}
                </button>
              </div>
            </div>

            {/* Colonne droite : GIF Tutoriel */}
            <div style={{ flex: '1 1 400px', minWidth: '320px' }}>
              <div style={{
                ...styles.card,
                padding: '24px',
                position: 'sticky',
                top: '20px'
              }}>
                <h3 style={{
                  ...styles.title,
                  fontSize: '18px',
                  color: '#f7c724',
                  marginTop: 0,
                  marginBottom: '16px'
                }}>
                  📖 Comment exporter depuis GSC ?
                </h3>
                <p style={{
                  ...styles.text,
                  fontSize: '14px',
                  color: '#999',
                  marginBottom: '16px',
                  lineHeight: '1.6'
                }}>
                  Suivez ce tutoriel pour exporter vos données depuis Google Search Console :
                </p>
                <div style={{
                  border: '2px solid #333',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#000'
                }}>
                  <img
                    src="/bon-gif.gif"
                    alt="Tutoriel export GSC"
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block'
                    }}
                  />
                </div>
                <p style={{
                  ...styles.text,
                  fontSize: '12px',
                  color: '#666',
                  marginTop: '12px',
                  lineHeight: '1.5'
                }}>
                  1️⃣ Allez dans Google Search Console<br />
                  2️⃣ Performance → Requêtes<br />
                  3️⃣ Exportez le fichier CSV<br />
                  4️⃣ Décompressez le ZIP et uploadez le CSV ici
                </p>
              </div>
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
                            ...styles.text,
                            marginTop: '12px',
                            padding: '10px 16px',
                            background: '#f7c724',
                            color: '#000',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '12px',
                            width: '100%'
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
              <div style={{ ...styles.text, fontSize: '13px', color: '#fdf13e', marginBottom: '6px' }}>
                ⚠️ <strong>Disclaimer</strong>
              </div>
              <div style={{ ...styles.text, fontSize: '12px', color: '#ccc', lineHeight: '1.5' }}>
                Les positions moyennes de la Search Console <strong>ne reflètent pas l'ensemble de la SERP</strong> car elles excluent les fonctionnalités SERP (featured snippets, PAA, local pack, images, etc.).
                Ces données constituent néanmoins un <strong>bon premier indicateur</strong> pour estimer le trafic potentiel et identifier les opportunités d'optimisation.
                Pour une analyse complète, croisez avec des données externes (Semrush, Ahrefs, etc.).
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
