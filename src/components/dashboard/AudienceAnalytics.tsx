import { useEffect, useState } from 'react';
import { MapPin, Users, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LocationData {
  country_name: string;
  country_code: string;
  count: number;
}

interface AudienceAnalyticsProps {
  channelId: string;
}

export function AudienceAnalytics({ channelId }: AudienceAnalyticsProps) {
  const [locationData, setLocationData] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSubscribers, setTotalSubscribers] = useState(0);

  useEffect(() => {
    loadAnalytics();
  }, [channelId]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Get subscriber locations aggregated by country
      const { data: locations, error: locationsError } = await supabase
        .from('subscriber_locations')
        .select('country_name, country_code')
        .eq('channel_id', channelId);

      if (locationsError) throw locationsError;

      // Aggregate by country
      const countryCounts: { [key: string]: { name: string; code: string; count: number } } = {};
      locations?.forEach(location => {
        if (location.country_name) {
          const key = location.country_name;
          if (!countryCounts[key]) {
            countryCounts[key] = {
              name: location.country_name,
              code: location.country_code || '',
              count: 0
            };
          }
          countryCounts[key].count++;
        }
      });

      const aggregatedData = Object.values(countryCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 countries

      setLocationData(aggregatedData);
      setTotalSubscribers(aggregatedData.reduce((sum, item) => sum + item.count, 0));
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded animate-pulse"></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Countries</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded animate-pulse"></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Country</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded animate-pulse"></div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Subscriber Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <div className="h-4 bg-muted rounded animate-pulse w-24"></div>
                  <div className="h-4 bg-muted rounded animate-pulse w-12"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const topCountry = locationData[0];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubscribers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              subscribers with location data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Countries</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locationData.length}</div>
            <p className="text-xs text-muted-foreground">
              countries represented
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Country</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topCountry?.name || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">
              {topCountry ? `${topCountry.count} subscribers` : 'No data available'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Location Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Subscriber Locations by Country
          </CardTitle>
        </CardHeader>
        <CardContent>
          {locationData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No location data available yet</p>
              <p className="text-sm">Location data is collected when subscribers sign up</p>
            </div>
          ) : (
            <div className="space-y-3">
              {locationData.map((location, index) => {
                const percentage = totalSubscribers > 0 ? (location.count / totalSubscribers) * 100 : 0;
                return (
                  <div key={location.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                        <span className="text-sm font-medium text-primary">
                          {index + 1}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{location.name}</span>
                          {location.code && (
                            <Badge variant="secondary" className="text-xs">
                              {location.code}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {location.count} subscriber{location.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {percentage.toFixed(1)}%
                      </div>
                      <div className="w-24 bg-muted rounded-full h-2 mt-1">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}