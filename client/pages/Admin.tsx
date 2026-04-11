import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckCircle, XCircle, Clock, Trash2, ImagePlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MarketProps {
  id: string;
  title: string;
  description: string;
  category: string;
  endDate?: string;
  status: 'active' | 'resolved_yes' | 'resolved_no';
  yesPrice: number;
  noPrice: number;
  volume: number;
  marketType: 'binary' | 'versus' | 'multi';
  teams?: { name: string; imageUrl?: string }[];
  optionA?: string;
  optionB?: string;
  shortA?: string;
  shortB?: string;
}

interface TeamEntry {
  name: string;
  imageUrl: string;    // Preview URL (object URL or uploaded URL)
  file?: File;
}

type MarketType = 'binary' | 'versus' | 'multi';

const EMPTY_TEAM: TeamEntry = { name: '', imageUrl: '' };

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  const json = await res.json();
  return json.url as string;
}

export default function Admin() {
  const [newMarket, setNewMarket] = useState({
    title: '',
    description: '',
    category: '',
    endDate: '',
    marketType: 'binary' as MarketType,
    optionA: '',
    optionB: '',
    shortA: '',
    shortB: '',
    // versus logo
    logoFile: null as File | null,
    logoPreview: '',
  });

  // Multi-market teams
  const [teams, setTeams] = useState<TeamEntry[]>([{ ...EMPTY_TEAM }, { ...EMPTY_TEAM }]);
  // Multi-market global logo
  const [multiLogoFile, setMultiLogoFile] = useState<File | null>(null);
  const [multiLogoPreview, setMultiLogoPreview] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [markets, setMarkets] = useState<MarketProps[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const multiLogoRef = useRef<HTMLInputElement>(null);

  const queryResult = useQuery<MarketProps[]>({
    queryKey: ['adminMarkets'],
    queryFn: async () => {
      const response = await fetch('/api/markets', { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to load markets');
      return response.json();
    },
  });

  useEffect(() => {
    if (queryResult.data) setMarkets(queryResult.data);
  }, [queryResult.data]);

  const resolveMarketMutation = useMutation({
    mutationFn: async ({ marketId, outcome, teamIndex }: { marketId: string; outcome: 'yes' | 'no'; teamIndex?: number }) => {
      const response = await fetch(`/api/markets/${marketId}/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, teamIndex }),
      });
      if (!response.ok) throw new Error('Unable to resolve market');
      return response.json();
    },
    onSuccess: (updatedMarket: MarketProps) => {
      setMarkets((current) => current.map((m) => (m.id === updatedMarket.id ? updatedMarket : m)));
      queryClient.invalidateQueries({ queryKey: ['adminMarkets'] });
    },
  });

  // ── Team helpers ──────────────────────────────────────────────────────────
  const handleTeamNameChange = (idx: number, value: string) => {
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, name: value } : t)));
  };

  const handleTeamImageChange = (idx: number, file: File) => {
    const preview = URL.createObjectURL(file);
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, file, imageUrl: preview } : t)));
  };

  const addTeam = () => setTeams((prev) => [...prev, { ...EMPTY_TEAM }]);
  const removeTeam = (idx: number) => setTeams((prev) => prev.filter((_, i) => i !== idx));

  // ── Create market ─────────────────────────────────────────────────────────
  const handleCreateMarket = async () => {
    if (!newMarket.title || !newMarket.description || !newMarket.category || !newMarket.endDate) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }

    if (newMarket.marketType === 'multi' && teams.some((t) => !t.name.trim())) {
      toast({ title: 'Error', description: 'All team names are required', variant: 'destructive' });
      return;
    }

    try {
      setIsCreating(true);

      // Upload market logo (unified for all types)
      let logoUrl: string | undefined;
      if (multiLogoFile) {
        logoUrl = await uploadImage(multiLogoFile);
      }

      // Upload team images (only for multi)
      let teamsPayload: { name: string; imageUrl?: string }[] | undefined;
      if (newMarket.marketType === 'multi') {
        teamsPayload = await Promise.all(
          teams.map(async (t) => ({
            name: t.name,
            imageUrl: t.file ? await uploadImage(t.file) : undefined,
          }))
        );
      }

      const payload: any = {
        title: newMarket.title,
        description: newMarket.description,
        category: newMarket.category,
        endDate: newMarket.endDate,
        marketType: newMarket.marketType,
        logoUrl, // Pass logo for all types
      };

      if (newMarket.marketType === 'versus') {
        payload.optionA = newMarket.optionA;
        payload.optionB = newMarket.optionB;
        payload.shortA = newMarket.shortA;
        payload.shortB = newMarket.shortB;
      }

      if (newMarket.marketType === 'multi') {
        payload.logoUrl = logoUrl;
        payload.teams = teamsPayload;
      }

      const response = await fetch('/api/markets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Unable to create market');
      const market = await response.json();

      setMarkets((current) => [market, ...current]);
      queryClient.invalidateQueries({ queryKey: ['adminMarkets'] });
      setNewMarket({ title: '', description: '', category: '', endDate: '', marketType: 'binary', optionA: '', optionB: '', shortA: '', shortB: '', logoFile: null, logoPreview: '' });
      setTeams([{ ...EMPTY_TEAM }, { ...EMPTY_TEAM }]);
      setMultiLogoFile(null);
      setMultiLogoPreview('');
      toast({ title: 'Success', description: 'Market created successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Could not create market', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleResolveMarket = async (marketId: string, outcome: 'yes' | 'no', teamIndex?: number) => {
    try {
      await resolveMarketMutation.mutateAsync({ marketId, outcome, teamIndex });
      toast({ title: 'Market Resolved', description: `Market resolved as ${outcome.toUpperCase()}` });
    } catch {
      toast({ title: 'Error', description: 'Failed to resolve market', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: MarketProps['status']) => {
    switch (status) {
      case 'active': return <Badge variant="secondary" className="bg-green-500/10 text-green-500"><Clock className="w-3 h-3 mr-1" />Active</Badge>;
      case 'resolved_yes': return <Badge variant="secondary" className="bg-yes/10 text-yes"><CheckCircle className="w-3 h-3 mr-1" />Resolved YES</Badge>;
      case 'resolved_no': return <Badge variant="secondary" className="bg-no/10 text-no"><XCircle className="w-3 h-3 mr-1" />Resolved NO</Badge>;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Create and manage prediction markets</p>
          </div>

          {/* Create New Market */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> Create New Market</CardTitle>
              <CardDescription>Add a new prediction market for users to bet on</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Market Title</Label>
                  <Input id="title" placeholder="Will [event] happen?" value={newMarket.title}
                    onChange={(e) => setNewMarket({ ...newMarket, title: e.target.value })} />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={newMarket.category} onValueChange={(v) => setNewMarket({ ...newMarket, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Education">Education</SelectItem>
                      <SelectItem value="Sports">Sports</SelectItem>
                      <SelectItem value="Technology">Technology</SelectItem>
                      <SelectItem value="Politics">Politics</SelectItem>
                      <SelectItem value="Entertainment">Entertainment</SelectItem>
                      <SelectItem value="IITR">IITR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Market Type */}
                <div className="space-y-2 col-span-1 md:col-span-1">
                  <Label htmlFor="marketType">Market Type</Label>
                  <Select value={newMarket.marketType} onValueChange={(v: any) => setNewMarket({ ...newMarket, marketType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="binary">Binary (Yes / No)</SelectItem>
                      <SelectItem value="versus">Versus (Team A vs Team B)</SelectItem>
                      <SelectItem value="multi">Multi-Team (many teams, each with Yes/No)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Market Logo — Available for all types — now in its own full-width row or separate div */}
                <div className="space-y-2 col-span-1 md:col-span-2">
                  <Label>Market Logo (optional)</Label>
                  <div className="flex items-center gap-4">
                    {multiLogoPreview ? (
                      <img src={multiLogoPreview} alt="logo" className="w-12 h-12 rounded-lg object-cover border border-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center border border-border">
                         <ImagePlus className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <Button variant="outline" type="button" onClick={() => multiLogoRef.current?.click()}>
                      <ImagePlus className="w-4 h-4 mr-2" /> {multiLogoPreview ? 'Change Logo' : 'Upload Logo'}
                    </Button>
                    {multiLogoPreview && (
                      <Button variant="ghost" size="sm" onClick={() => { setMultiLogoFile(null); setMultiLogoPreview(''); }}>
                        Remove
                      </Button>
                    )}
                    <input
                      ref={multiLogoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { setMultiLogoFile(f); setMultiLogoPreview(URL.createObjectURL(f)); }
                      }}
                    />
                  </div>
                </div>

                {/* Market Type */}

                {/* ── VERSUS fields ── */}
                {newMarket.marketType === 'versus' && (
                  <>
                    <div className="space-y-2">
                      <Label>Team A Full Name</Label>
                      <Input placeholder="e.g. Mumbai Indians" value={newMarket.optionA}
                        onChange={(e) => setNewMarket({ ...newMarket, optionA: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Team A Button Label</Label>
                      <Input placeholder="e.g. Mumbai" value={newMarket.shortA}
                        onChange={(e) => setNewMarket({ ...newMarket, shortA: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Team B Full Name</Label>
                      <Input placeholder="e.g. Royal Challengers Bengaluru" value={newMarket.optionB}
                        onChange={(e) => setNewMarket({ ...newMarket, optionB: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Team B Button Label</Label>
                      <Input placeholder="e.g. Royal" value={newMarket.shortB}
                        onChange={(e) => setNewMarket({ ...newMarket, shortB: e.target.value })} />
                    </div>
                  </>
                )}

                {/* ── MULTI fields ── */}
                {newMarket.marketType === 'multi' && (
                  <div className="col-span-1 md:col-span-2 space-y-4 pt-2">
                    {/* Teams */}
                    <div className="space-y-3">
                      <Label className="text-base">Teams & Individual Logos</Label>
                      {teams.map((team, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          {/* Team image */}
                          <label className="cursor-pointer group relative shrink-0">
                            <div className="w-12 h-12 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center">
                              {team.imageUrl
                                ? <img src={team.imageUrl} alt={team.name} className="w-full h-full object-cover" />
                                : <ImagePlus className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                              }
                            </div>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTeamImageChange(idx, f); }} />
                          </label>

                          {/* Team name */}
                          <Input
                            placeholder={`Team ${idx + 1} name...`}
                            value={team.name}
                            onChange={(e) => handleTeamNameChange(idx, e.target.value)}
                            className="flex-1"
                          />

                          {/* Remove */}
                          {teams.length > 2 && (
                            <Button variant="ghost" size="icon" onClick={() => removeTeam(idx)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addTeam} className="w-full mt-1">
                        <Plus className="w-4 h-4 mr-2" /> Add Team
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Provide context and details about the market..."
                  value={newMarket.description}
                  onChange={(e) => setNewMarket({ ...newMarket, description: e.target.value })} rows={3} />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" type="date" value={newMarket.endDate}
                  onChange={(e) => setNewMarket({ ...newMarket, endDate: e.target.value })} />
              </div>

              <Button onClick={handleCreateMarket} disabled={isCreating} className="w-full md:w-auto">
                {isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Market'}
              </Button>
            </CardContent>
          </Card>

          {/* Manage Existing Markets */}
          <Card>
            <CardHeader>
              <CardTitle>Manage Markets</CardTitle>
              <CardDescription>Resolve markets and view their current status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {markets.map((market) => (
                  <motion.div key={market.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-foreground">{market.title}</h3>
                        {getStatusBadge(market.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{market.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Volume: ₹{market.volume.toLocaleString()}</span>
                        {market.endDate && <span>Ends: {new Date(market.endDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {market.status === 'active' && (
                      <div className="flex flex-col gap-2">
                        {market.marketType === 'multi' && market.teams ? (
                          <div className="space-y-4 border-t border-border pt-4 mt-2">
                             <Label className="text-xs uppercase text-muted-foreground">Resolve Teams</Label>
                             <div className="space-y-2">
                               {market.teams.map((team, tIdx) => (
                                 <div key={tIdx} className="flex items-center justify-between gap-4 p-2 bg-muted/20 rounded-md">
                                   <span className="text-sm font-medium">{team.name}</span>
                                   <div className="flex gap-2">
                                     <Button size="sm" variant="outline" className="text-yes h-7 px-2"
                                       onClick={() => handleResolveMarket(market.id, 'yes', tIdx)}>Win</Button>
                                     <Button size="sm" variant="outline" className="text-no h-7 px-2"
                                       onClick={() => handleResolveMarket(market.id, 'no', tIdx)}>Lose</Button>
                                   </div>
                                 </div>
                               ))}
                             </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-yes border-yes hover:bg-yes/10"
                              onClick={() => handleResolveMarket(market.id, 'yes')}>
                              Resolve {market.marketType === 'versus' ? (market.shortA || market.optionA || 'A') : 'YES'}
                            </Button>
                            <Button size="sm" variant="outline" className="text-no border-no hover:bg-no/10"
                              onClick={() => handleResolveMarket(market.id, 'no')}>
                              Resolve {market.marketType === 'versus' ? (market.shortB || market.optionB || 'B') : 'NO'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
}