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

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken
    });

    const searchconsole = google.searchconsole({
      version: 'v1',
      auth: oauth2Client
    });

    const response = await searchconsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: startDate,
        endDate: endDate,
        dimensions: ['query', 'page'],
        rowLimit: 25000,
        dataState: 'final'
      }
    });

    // Agréger les données par query (GSC renvoie une ligne par query+page)
    const queryMap = new Map();

    (response.data.rows || []).forEach((row: any) => {
      const query = row.keys[0];
      const page = row.keys[1];
      const clicks = row.clicks || 0;
      const impressions = row.impressions || 0;
      const position = row.position || 0;

      if (!queryMap.has(query)) {
        queryMap.set(query, {
          query,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
          pages: []
        });
      }

      const queryData = queryMap.get(query);

      // Agréger les totaux
      queryData.clicks += clicks;
      queryData.impressions += impressions;

      // Stocker le détail par page
      queryData.pages.push({
        url: page,
        clicks,
        impressions,
        position
      });
    });

    // Calculer les moyennes pondérées et CTR
    const queries = Array.from(queryMap.values()).map(q => {
      // Position moyenne pondérée par impressions
      const totalWeightedPosition = q.pages.reduce(
        (sum, p) => sum + (p.position * p.impressions),
        0
      );
      q.position = q.impressions > 0
        ? totalWeightedPosition / q.impressions
        : 0;

      // CTR
      q.ctr = q.impressions > 0
        ? q.clicks / q.impressions
        : 0;

      // Trier les pages par clicks (desc)
      q.pages.sort((a, b) => b.clicks - a.clicks);

      return q;
    });

    return NextResponse.json({
      queries,
      totalQueries: queries.length
    });

  } catch (error: any) {
    console.error('Error fetching GSC data:', error);

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
