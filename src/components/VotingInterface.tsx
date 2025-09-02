import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Vote, CheckCircle, Clock, Users } from 'lucide-react';
import { Badge } from './ui/badge';

interface Election {
  id: string;
  title: string;
  description: string;
  options: string[];
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface VotingInterfaceProps {
  userId: string;
  onVoteComplete: () => void;
}

export const VotingInterface: React.FC<VotingInterfaceProps> = ({ 
  userId, 
  onVoteComplete 
}) => {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadElections();
  }, []);

  const loadElections = async () => {
    try {
      // Load active elections
      const { data: electionsData, error: electionsError } = await supabase
        .from('elections')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (electionsError) {
        console.error('Error loading elections:', electionsError);
        toast.error('Failed to load elections');
        return;
      }

      // Load user's existing votes
      const { data: votesData, error: votesError } = await supabase
        .from('votes')
        .select('election_id')
        .eq('user_id', userId);

      if (votesError) {
        console.error('Error loading user votes:', votesError);
      }

      const votedElectionIds = new Set(votesData?.map(vote => vote.election_id) || []);
      setUserVotes(votedElectionIds);
      
      // Transform elections data to match our interface
      const transformedElections = (electionsData || []).map(election => ({
        ...election,
        options: Array.isArray(election.options) 
          ? election.options as string[]
          : JSON.parse(election.options as string) as string[]
      }));
      
      setElections(transformedElections);
      
      // Auto-select first available election
      const availableElection = transformedElections.find(e => !votedElectionIds.has(e.id));
      if (availableElection) {
        setSelectedElection(availableElection);
      }
    } catch (error) {
      console.error('Error in loadElections:', error);
      toast.error('Failed to load voting data');
    } finally {
      setIsLoading(false);
    }
  };

  const submitVote = async () => {
    if (!selectedElection || !selectedOption) {
      toast.error('Please select an option to vote');
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit vote
      const { error: voteError } = await supabase
        .from('votes')
        .insert({
          user_id: userId,
          election_id: selectedElection.id,
          selected_option: selectedOption,
          face_verified: true,
          blink_verified: true,
          ip_address: await getUserIP(),
          user_agent: navigator.userAgent
        });

      if (voteError) {
        if (voteError.code === '23505') { // Unique constraint violation
          toast.error('You have already voted in this election');
        } else {
          console.error('Vote submission error:', voteError);
          toast.error('Failed to submit vote');
        }
        setIsSubmitting(false);
        return;
      }

      // Log audit trail
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'VOTE_SUBMITTED',
        details: {
          election_id: selectedElection.id,
          election_title: selectedElection.title,
          selected_option: selectedOption
        }
      });

      toast.success('Vote submitted successfully! 🗳️');
      
      // Update local state
      setUserVotes(prev => new Set([...prev, selectedElection.id]));
      
      setTimeout(() => {
        onVoteComplete();
      }, 2000);

    } catch (error) {
      console.error('Error submitting vote:', error);
      toast.error('Failed to submit vote');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getUserIP = async (): Promise<string> => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isElectionActive = (election: Election) => {
    const now = new Date();
    const start = new Date(election.start_date);
    const end = new Date(election.end_date);
    return now >= start && now <= end && election.is_active;
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading elections...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (elections.length === 0) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="text-center p-8">
          <Vote className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No Active Elections</h3>
          <p className="text-muted-foreground">
            There are currently no elections available for voting.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Election Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-6 w-6" />
            Available Elections
          </CardTitle>
          <CardDescription>
            Select an election to cast your vote
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {elections.map((election) => {
              const hasVoted = userVotes.has(election.id);
              const isActive = isElectionActive(election);
              
              return (
                <div 
                  key={election.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedElection?.id === election.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  } ${hasVoted ? 'opacity-60' : ''}`}
                  onClick={() => !hasVoted && isActive && setSelectedElection(election)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{election.title}</h3>
                        {hasVoted && (
                          <Badge variant="secondary" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Voted
                          </Badge>
                        )}
                        {!isActive && (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {election.description}
                      </p>
                      <div className="text-xs text-muted-foreground">
                        <p>Starts: {formatDate(election.start_date)}</p>
                        <p>Ends: {formatDate(election.end_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        <Users className="h-3 w-3 mr-1" />
                        {election.options.length} options
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Voting Form */}
      {selectedElection && !userVotes.has(selectedElection.id) && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedElection.title}</CardTitle>
            <CardDescription>
              {selectedElection.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-semibold">Select your choice:</h4>
              {selectedElection.options.map((option, index) => (
                <div 
                  key={index}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedOption === option 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedOption(option)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{option}</span>
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      selectedOption === option 
                        ? 'border-primary bg-primary' 
                        : 'border-muted-foreground'
                    }`}>
                      {selectedOption === option && (
                        <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 justify-center pt-4">
              <Button 
                onClick={submitVote}
                disabled={!selectedOption || isSubmitting}
                size="lg"
                className="min-w-32"
              >
                {isSubmitting ? 'Submitting...' : 'Cast Vote'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vote Confirmation */}
      {selectedElection && userVotes.has(selectedElection.id) && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="text-center p-8">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-600" />
            <h3 className="text-xl font-semibold mb-2 text-green-800">
              Vote Submitted Successfully!
            </h3>
            <p className="text-green-700">
              Your vote for "{selectedElection.title}" has been recorded.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};