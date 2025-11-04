import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const { accessToken, siteUrl, startDate, endDate } = await request.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing access token' },
        { status: 400 }
      );
    }

    if (!siteUrl || typeof siteUrl !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing site URL' },
        { status: 400 }
      );
    }

    // Configurer OAuth client avec le token d'accès
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken
    });

    // Initialiser le client Search Console
    const searchconsole = google.searchconsole({
      version: 'v1',
      auth: oauth2Client
    });

    // Récupérer les données de requêtes
    const response = await searchconsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: startDate,
        endDate: endDate,
        dimensions: ['query'],
        rowLimit: 25000, // Maximum autorisé par l'API
        dataState: 'final'
      }
    });

    // Formater les données pour correspondre au format CSV attendu
    const queries = (response.data.rows || []).map((row: any) => ({
      query: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0
    }));

    return NextResponse.json({
      queries,
      totalQueries: queries.length
    });

  } catch (error: any) {
    console.error('Error fetching GSC data:', error);

    // Gérer les erreurs d'autorisation
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Authorization expired or invalid. Please reconnect.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch GSC data', details: error.message },
      { status: 500 }
    );
  }
}
