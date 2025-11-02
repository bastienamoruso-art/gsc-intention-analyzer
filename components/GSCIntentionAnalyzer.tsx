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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658'];

export default function GSCIntentionAnalyzer() {
  const [step, setStep] = useState<number>(1);
  const [brand, setBrand] = useState<string>('');
  const [sector, setSector] = useState<string>('');
  const [queries, setQueries] = useState<QueryData[]>([]);
  const [classifiedQueries, setClassifiedQueries] = useState<QueryData[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Étape 1 : Upload CSV
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          // Debug : afficher les colonnes détectées
          const firstRow = results.data[0] as any;
          const columns = firstRow ? Object.keys(firstRow) : [];
          console.log('🔍 Colonnes détectées dans le CSV:', columns);

          const parsed = results.data.map((row: any) => {
            // Gérer différents formats d'export GSC
            const query = row['Top queries'] || row['Requête'] || row['Query'] || row['query'] || '';
            const clicks = parseFloat(row['Clicks'] || row['Clics'] || row['clicks'] || '0');
            const impressions = parseFloat(row['Impressions'] || row['impressions'] || '0');
            const ctr = parseFloat(row['CTR'] || row['ctr'] || '0');
            const position = parseFloat(row['Position'] || row['position'] || '0');

            return {
              query: query.trim(),
              clicks,
              impressions,
              ctr: ctr > 1 ? ctr / 100 : ctr, // Normaliser le CTR
              position
            };
          }).filter(q => q.query && q.impressions > 0);

          if (parsed.length === 0) {
            setError(`Aucune donnée valide trouvée dans le fichier CSV. Colonnes détectées : ${columns.join(', ')}`);
            return;
          }

          setQueries(parsed);
          setError('');
          console.log(`✅ ${parsed.length} requêtes chargées`);
        } catch (err) {
          setError('Erreur lors du parsing du CSV : ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      },
      error: (err) => {
        setError('Erreur lors de la lecture du fichier : ' + err.message);
      }
    });
  };

  // Étape 2 : Analyser avec Claude
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queries,
          brand,
          sector
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze queries');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setClassifiedQueries(data.classifiedQueries);
      setStep(2);
      console.log('✅ Analyse complétée', data.analysis);
    } catch (err) {
      setError('Erreur lors de l\'analyse : ' + (err instanceof Error ? err.message : 'Unknown error'));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Générer la matrice Position × Intention
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
            count: queriesInCell.length
          };
        } else {
          row[intention.nom] = { ctr: 0, count: 0 };
        }
      });

      return row;
    });
  };

  // Préparer les données pour le graphique de distribution
  const getIntentionDistribution = () => {
    if (!analysis) return [];

    return analysis.intentions.map((intention, idx) => ({
      name: intention.nom,
      value: intention.volume,
      color: COLORS[idx % COLORS.length]
    }));
  };

  // Affichage selon l'étape
  if (step === 1) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px'
        }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>🎯 Analyseur d'Intentions GSC</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Découvrez les micro-intentions cachées dans votre trafic Search Console
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fee',
            border: '1px solid #fcc',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#c00'
          }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{
          background: 'white',
          border: '1px solid #e0e0e0',
          borderRadius: '12px',
          padding: '30px',
          marginBottom: '20px'
        }}>
          <h2 style={{ marginTop: 0 }}>📊 Étape 1 : Chargez vos données</h2>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Marque (optionnel)
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Ex: Nike, Apple, etc."
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Secteur (optionnel)
            </label>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Ex: E-commerce, SaaS, etc."
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              📁 Export CSV Google Search Console
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{
                width: '100%',
                padding: '10px',
                border: '2px dashed #ddd',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
              💡 Exportez depuis GSC : Performance &gt; Requêtes &gt; Exporter
            </p>
          </div>

          {queries.length > 0 && (
            <div style={{
              background: '#f0f9ff',
              border: '1px solid #bfdbfe',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              ✅ <strong>{queries.length} requêtes</strong> chargées
              <div style={{ fontSize: '12px', marginTop: '5px', color: '#666' }}>
                Total clics : {queries.reduce((sum, q) => sum + q.clicks, 0).toLocaleString()} |
                Total impressions : {queries.reduce((sum, q) => sum + q.impressions, 0).toLocaleString()}
              </div>
            </div>
          )}

          <button
            onClick={analyzeQueries}
            disabled={queries.length === 0 || isLoading}
            style={{
              width: '100%',
              padding: '15px',
              background: queries.length === 0 ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: queries.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => {
              if (queries.length > 0) {
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {isLoading ? '🔄 Analyse en cours...' : '🚀 Analyser les intentions'}
          </button>
        </div>

        <div style={{
          background: '#fefce8',
          border: '1px solid #fde047',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          <strong>💡 Ce que fait cet outil :</strong>
          <ul style={{ marginBottom: 0, paddingLeft: '20px' }}>
            <li>Découvre automatiquement les intentions dans vos requêtes (pas de catégories fixes)</li>
            <li>Génère une matrice Position × Intention avec CTR</li>
            <li>Détecte les patterns linguistiques</li>
            <li>Vous guide vers les 5 requêtes à analyser manuellement dans Google</li>
          </ul>
        </div>
      </div>
    );
  }

  // Étape 2 : Résultats
  if (step === 2 && analysis) {
    const matrix = generateMatrix();
    const distribution = getIntentionDistribution();

    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px'
        }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>✅ Analyse terminée</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {classifiedQueries.length} requêtes classifiées • {analysis.intentions.length} intentions découvertes
          </p>
        </div>

        {/* Insights stratégiques */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '20px', borderRadius: '12px' }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🎯</div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#166534' }}>OPPORTUNITÉ PRINCIPALE</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>{analysis.insights.biggest_opportunity}</p>
          </div>
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', padding: '20px', borderRadius: '12px' }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#991b1b' }}>FRICTION PRINCIPALE</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>{analysis.insights.biggest_friction}</p>
          </div>
          <div style={{ background: '#fef3c7', border: '1px solid #fde047', padding: '20px', borderRadius: '12px' }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#854d0e' }}>QUICK WIN</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>{analysis.insights.quick_win}</p>
          </div>
        </div>

        {/* Distribution des intentions */}
        <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '30px', marginBottom: '30px' }}>
          <h2 style={{ marginTop: 0 }}>📊 Distribution des intentions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name} (${entry.value})`}
                  >
                    {distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              {analysis.intentions.map((intention, idx) => (
                <div key={idx} style={{
                  padding: '12px',
                  background: '#f9fafb',
                  borderLeft: `4px solid ${COLORS[idx % COLORS.length]}`,
                  marginBottom: '10px',
                  borderRadius: '4px'
                }}>
                  <strong style={{ color: COLORS[idx % COLORS.length] }}>{intention.nom}</strong>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    {intention.description}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                    📊 {intention.volume} requêtes • CTR: {(intention.ctr_moyen * 100).toFixed(1)}% • Pos: {intention.position_moyenne.toFixed(1)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    🔍 Signal: <em>{intention.signal_linguistique}</em>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Matrice Position × Intention */}
        <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '30px', marginBottom: '30px' }}>
          <h2 style={{ marginTop: 0 }}>🎯 Matrice Position × Intention (CTR %)</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>
            Cette matrice montre le CTR moyen pour chaque combinaison Position/Intention dans VOS données
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', background: '#f3f4f6', border: '1px solid #e5e7eb', textAlign: 'left' }}>
                    Position
                  </th>
                  {analysis.intentions.map((intention, idx) => (
                    <th key={idx} style={{
                      padding: '12px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      textAlign: 'center',
                      color: COLORS[idx % COLORS.length]
                    }}>
                      {intention.nom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td style={{ padding: '12px', border: '1px solid #e5e7eb', fontWeight: 600 }}>
                      {row.position}
                    </td>
                    {analysis.intentions.map((intention, colIdx) => {
                      const cellData = row[intention.nom];
                      const ctrPercent = (cellData.ctr * 100).toFixed(1);
                      const heatIntensity = Math.min(cellData.ctr * 10, 1);

                      return (
                        <td key={colIdx} style={{
                          padding: '12px',
                          border: '1px solid #e5e7eb',
                          textAlign: 'center',
                          background: cellData.count > 0
                            ? `rgba(34, 197, 94, ${heatIntensity})`
                            : '#f9fafb'
                        }}>
                          {cellData.count > 0 ? (
                            <>
                              <div style={{ fontWeight: 600 }}>{ctrPercent}%</div>
                              <div style={{ fontSize: '10px', color: '#666' }}>
                                ({cellData.count} req)
                              </div>
                            </>
                          ) : (
                            <span style={{ color: '#ccc' }}>-</span>
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

        {/* Patterns linguistiques */}
        <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '30px', marginBottom: '30px' }}>
          <h2 style={{ marginTop: 0 }}>🔤 Patterns linguistiques détectés</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            {analysis.patterns_linguistiques.mots_recurrents.length > 0 && (
              <div>
                <h3 style={{ fontSize: '14px', color: '#667eea' }}>Mots récurrents</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {analysis.patterns_linguistiques.mots_recurrents.map((mot, idx) => (
                    <span key={idx} style={{
                      background: '#ede9fe',
                      color: '#5b21b6',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {mot}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.patterns_linguistiques.structures_questions.length > 0 && (
              <div>
                <h3 style={{ fontSize: '14px', color: '#667eea' }}>Structures de questions</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {analysis.patterns_linguistiques.structures_questions.map((structure, idx) => (
                    <span key={idx} style={{
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {structure}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.patterns_linguistiques.modificateurs_temporels.length > 0 && (
              <div>
                <h3 style={{ fontSize: '14px', color: '#667eea' }}>Modificateurs temporels</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {analysis.patterns_linguistiques.modificateurs_temporels.map((mod, idx) => (
                    <span key={idx} style={{
                      background: '#fef3c7',
                      color: '#92400e',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {mod}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.patterns_linguistiques.termes_comparatifs.length > 0 && (
              <div>
                <h3 style={{ fontSize: '14px', color: '#667eea' }}>Termes comparatifs</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {analysis.patterns_linguistiques.termes_comparatifs.map((terme, idx) => (
                    <span key={idx} style={{
                      background: '#fce7f3',
                      color: '#9f1239',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {terme}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Prochaines étapes */}
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde047 100%)',
          border: '2px solid #facc15',
          padding: '30px',
          borderRadius: '12px'
        }}>
          <h2 style={{ marginTop: 0, fontSize: '20px' }}>🎯 Prochaine étape : Analyse manuelle SERP</h2>
          <p style={{ marginBottom: '20px' }}>
            Maintenant que vous avez identifié les intentions, sélectionnez <strong>5 requêtes stratégiques</strong> et
            analysez-les manuellement dans Google pour comprendre les SERP et affiner votre stratégie de contenu.
          </p>
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <strong>Recommandations de requêtes à analyser :</strong>
            <ol style={{ marginBottom: 0, paddingLeft: '20px' }}>
              {analysis.intentions.slice(0, 5).map((intention, idx) => (
                <li key={idx}>
                  <strong>{intention.nom}</strong> : {intention.exemples[0]}
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    → {intention.description}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <button
            onClick={() => {
              setStep(1);
              setQueries([]);
              setClassifiedQueries([]);
              setAnalysis(null);
            }}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#667eea',
              border: '2px solid #667eea',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ← Nouvelle analyse
          </button>
        </div>
      </div>
    );
  }

  return null;
}
