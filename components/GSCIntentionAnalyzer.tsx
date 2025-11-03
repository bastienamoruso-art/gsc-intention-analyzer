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
}

const COLORS = ['#f7c724', '#0edd89', '#27f6c5', '#c526f6', '#27bef7', '#fdf13e', '#f142fd'];

export default function GSCIntentionAnalyzer() {
  const [step, setStep] = useState<number>(1);
  const [brand, setBrand] = useState<string>('');
  const [sector, setSector] = useState<string>('');
  const [queries, setQueries] = useState<QueryData[]>([]);
  const [classifiedQueries, setClassifiedQueries] = useState<QueryData[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{ intention: string; posGroup: string; queries: QueryData[] } | null>(null);
  const [expandedIntention, setExpandedIntention] = useState<string | null>(null);
  const [showEmailPopup, setShowEmailPopup] = useState<boolean>(false);

  // Afficher la popup 8 secondes après les résultats
  React.useEffect(() => {
    if (step === 2 && analysis) {
      const timer = setTimeout(() => {
        setShowEmailPopup(true);
      }, 8000);
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
          const avgCTR = queriesInCell.reduce((sum, q) => sum + q.ctr, 0) / queriesInCell.length;
          row[intention.nom] = {
            ctr: avgCTR,
            count: queriesInCell.length,
            queries: queriesInCell
          };
        } else {
          row[intention.nom] = { ctr: 0, count: 0, queries: [] };
        }
      });

      return row;
    });
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

    const quickWins = intentionQueries.filter(q =>
      q.position >= 4 && q.position <= 10 && q.impressions > 100
    );

    return { totalClicks, totalImpressions, top5, positionDistribution, quickWins };
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

        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
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

          <div style={{ ...styles.card, marginBottom: '20px' }}>
            <h2 style={{ ...styles.title, marginTop: 0, color: '#f7c724' }}>
              📊 ÉTAPE 1 : CHARGEZ VOS DONNÉES
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ ...styles.text, display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                Marque (optionnel)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Nike, Apple, etc."
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
              disabled={queries.length === 0 || isLoading}
              style={{
                ...styles.button,
                width: '100%',
                padding: '16px',
                opacity: queries.length === 0 ? 0.5 : 1,
                cursor: queries.length === 0 ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => {
                if (queries.length > 0) {
                  e.currentTarget.style.background = '#f7c724';
                  e.currentTarget.style.color = '#000';
                }
              }}
              onMouseLeave={(e) => {
                if (queries.length > 0) {
                  e.currentTarget.style.background = '#000';
                  e.currentTarget.style.color = '#f7c724';
                }
              }}
            >
              {isLoading ? '🔄 ANALYSE EN COURS...' : '🚀 ANALYSER LES INTENTIONS'}
            </button>
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

          {/* Détails par intention (accordéon) */}
          <div style={{ ...styles.card, marginBottom: '30px' }}>
            <h2 style={{ ...styles.title, marginTop: 0, color: '#f7c724' }}>
              📊 DÉTAILS PAR INTENTION
            </h2>
            {analysis.intentions.map((intention, idx) => {
              const details = getIntentionDetails(intention.nom);
              const isExpanded = expandedIntention === intention.nom;

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
                        📊 {intention.volume} req • CTR: {(intention.ctr_moyen * 100).toFixed(1)}% • Pos: {intention.position_moyenne.toFixed(1)}
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
                      </div>

                      {details.quickWins.length > 0 && (
                        <div>
                          <div style={{ ...styles.text, fontSize: '12px', color: '#f7c724', marginBottom: '8px' }}>
                            ⚡ Quick wins ({details.quickWins.length} requêtes en P4-10 avec &gt;100 imp)
                          </div>
                          {details.quickWins.slice(0, 3).map((q, i) => (
                            <div key={i} style={{
                              ...styles.text,
                              fontSize: '11px',
                              padding: '8px',
                              background: '#2a1a0a',
                              borderRadius: '4px',
                              marginBottom: '4px'
                            }}>
                              <strong>"{q.query}"</strong> |
                              Pos: {q.position.toFixed(1)} |
                              Imp: {q.impressions}
                            </div>
                          ))}
                        </div>
                      )}
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
                              <>
                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{ctrPercent}%</div>
                                <div style={{ fontSize: '10px', color: '#999' }}>
                                  ({cellData.count} req)
                                  {isLowData && <span style={{ color: '#f7c724' }}> ⚠️</span>}
                                </div>
                              </>
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
