import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormData } from "../TicketForm";
import { Scale, Shield, Users, Camera, Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DefenseStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const DefenseStep = ({ formData, updateFormData }: DefenseStepProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const { toast } = useToast();

  const handleFieldUpdate = (field: keyof FormData, value: any) => {
    updateFormData({ [field]: value });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setAudioChunks(chunks);

      toast({
        title: "Recording started",
        description: "Speak clearly into your microphone. Click the button again to stop.",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      toast({
        title: "Transcribing...",
        description: "Converting your speech to text...",
      });

      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const audioBase64 = await base64Promise;

      // Call edge function
      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: audioBase64 }
      });

      if (error) throw error;

      if (data?.text) {
        // Append transcribed text to existing explanation
        const currentText = formData.explanation;
        const newText = currentText 
          ? `${currentText}\n\n${data.text}` 
          : data.text;
        handleFieldUpdate("explanation", newText);

        toast({
          title: "Transcription complete",
          description: "Your speech has been added to the explanation.",
        });
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription failed",
        description: "Could not transcribe audio. Please try again or type manually.",
        variant: "destructive",
      });
    }
  };

  const pleaTypes = [
    { value: "not_guilty", label: "Not Guilty", description: "I did not commit this violation" },
    { value: "guilty_explanation", label: "Guilty with Explanation", description: "I committed the violation but have mitigating circumstances" },
    { value: "procedural", label: "Procedural Issues", description: "There were problems with how the ticket was issued" },
    { value: "emergency", label: "Emergency Situation", description: "I was responding to an emergency" },
    { value: "equipment_error", label: "Equipment Error", description: "The radar/camera was malfunctioning" },
  ];

  const commonDefenses = [
    "Emergency situation (medical, family emergency)",
    "Speedometer malfunction or inaccuracy", 
    "Road conditions (construction, unclear signage)",
    "Weather conditions affecting driving",
    "Officer error in identification or measurement",
    "Radar/laser equipment not properly calibrated",
    "Following traffic flow to avoid unsafe situation",
    "Prescription medication affecting judgment",
    "Mechanical failure requiring immediate attention"
  ];

  return (
    <div className="space-y-8">
      {/* Plea Type Selection */}
      <div className="space-y-4">
        <div>
          <Label className="text-lg font-semibold">How do you wish to plead? *</Label>
          <p className="text-sm text-muted-foreground mt-1">
            This determines our defense strategy for your case.
          </p>
        </div>

        <div className="grid gap-4">
          {pleaTypes.map((plea) => (
            <Card 
              key={plea.value}
              className={`p-4 cursor-pointer transition-smooth border-2 ${
                formData.pleaType === plea.value 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted hover:border-primary/30'
              }`}
              onClick={() => handleFieldUpdate("pleaType", plea.value)}
            >
              <div className="flex items-start gap-3">
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 transition-smooth ${
                  formData.pleaType === plea.value 
                    ? 'border-primary bg-primary' 
                    : 'border-muted-foreground'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{plea.label}</h4>
                    {plea.value === 'not_guilty' && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                        Highest Success Rate
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{plea.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="explanation" className="text-lg font-semibold">
            Explain Your Case *
          </Label>
          <Button
            type="button"
            variant={isRecording ? "destructive" : "outline"}
            size="sm"
            onClick={isRecording ? stopRecording : startRecording}
            className="flex items-center gap-2"
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Voice Input
              </>
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Provide a detailed explanation of why you believe you should not be found guilty. 
          Be honest and specific about the circumstances.
        </p>
        <Textarea
          id="explanation"
          value={formData.explanation}
          onChange={(e) => handleFieldUpdate("explanation", e.target.value)}
          placeholder="Describe what happened on the day you received the ticket. Include all relevant details about the situation, road conditions, weather, traffic, etc."
          className="min-h-32 transition-smooth focus:ring-2 focus:ring-primary/20"
        />
        {formData.explanation.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {formData.explanation.length} characters • The more detail, the better we can help
          </p>
        )}
      </div>

      {/* Circumstances */}
      <div className="space-y-3">
        <Label htmlFor="circumstances" className="text-lg font-semibold">
          Additional Circumstances
        </Label>
        <p className="text-sm text-muted-foreground">
          Were there any special circumstances that contributed to the situation?
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          {commonDefenses.map((defense, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                const current = formData.circumstances;
                const newText = current ? `${current}\n• ${defense}` : `• ${defense}`;
                handleFieldUpdate("circumstances", newText);
              }}
              className="text-xs p-2 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded transition-smooth text-left"
            >
              + {defense}
            </button>
          ))}
        </div>
        <Textarea
          id="circumstances"
          value={formData.circumstances}
          onChange={(e) => handleFieldUpdate("circumstances", e.target.value)}
          placeholder="Click the buttons above to add common circumstances, or type your own..."
          className="min-h-24 transition-smooth focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Witnesses */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <Label className="text-lg font-semibold">Witnesses</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="witnesses"
            checked={formData.witnesses}
            onCheckedChange={(checked) => handleFieldUpdate("witnesses", checked)}
          />
          <Label htmlFor="witnesses" className="text-sm font-medium">
            I have witnesses who can support my case
          </Label>
        </div>

        {formData.witnesses && (
          <div className="space-y-2">
            <Label htmlFor="witnessDetails">Witness Details</Label>
            <Textarea
              id="witnessDetails"
              value={formData.witnessDetails}
              onChange={(e) => handleFieldUpdate("witnessDetails", e.target.value)}
              placeholder="Provide names, contact information, and what each witness can testify about..."
              className="min-h-20 transition-smooth focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </Card>

      {/* Evidence */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Camera className="h-5 w-5 text-secondary" />
          <Label className="text-lg font-semibold">Additional Evidence</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="evidence"
            checked={formData.evidence}
            onCheckedChange={(checked) => handleFieldUpdate("evidence", checked)}
          />
          <Label htmlFor="evidence" className="text-sm font-medium">
            I have additional evidence (photos, videos, documents, etc.)
          </Label>
        </div>

        {formData.evidence && (
          <div className="space-y-2">
            <Label htmlFor="evidenceDetails">Evidence Description</Label>
            <Textarea
              id="evidenceDetails"
              value={formData.evidenceDetails}
              onChange={(e) => handleFieldUpdate("evidenceDetails", e.target.value)}
              placeholder="Describe what evidence you have and how it supports your case. We'll contact you about submitting these materials..."
              className="min-h-20 transition-smooth focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </Card>

      {/* Prior Tickets */}
      <div className="space-y-3">
        <Label className="text-lg font-semibold">Driving Record</Label>
        <p className="text-sm text-muted-foreground">
          Have you received any traffic tickets in the past 3 years?
        </p>
        <Select
          value={formData.priorTickets}
          onValueChange={(value) => handleFieldUpdate("priorTickets", value)}
        >
          <SelectTrigger className="transition-smooth focus:ring-2 focus:ring-primary/20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No prior tickets</SelectItem>
            <SelectItem value="1">1 previous ticket</SelectItem>
            <SelectItem value="2-3">2-3 previous tickets</SelectItem>
            <SelectItem value="4+">4 or more previous tickets</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
        <div className="flex items-start gap-3">
          <Scale className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-primary mb-1">Expert Defense Strategy</p>
            <p className="text-sm text-muted-foreground">
              Our legal experts will review your case details and build the strongest possible defense. 
              Honesty helps us prepare the most effective strategy for your specific situation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefenseStep;