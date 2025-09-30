import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Upload, FileImage, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import JurisdictionChecker from "../JurisdictionChecker";
import InstantTicketAnalyzer from "../InstantTicketAnalyzer";
import { FormData } from "../TicketForm";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ticketDetailsSchema = z.object({
  ticketNumber: z.string().min(1, "Ticket number is required"),
  issueDate: z.date({
    required_error: "Issue date is required",
  }),
  location: z.string().min(5, "Please provide the location where you received the ticket"),
  officer: z.string().min(2, "Officer name is required"),
  officerBadge: z.string().optional(),
  offenceSection: z.string().optional(),
  offenceSubSection: z.string().optional(),
  offenceDescription: z.string().optional(),
  violation: z.string().min(1, "Please select the violation type"),
  fineAmount: z.string().min(1, "Fine amount is required"),
  courtDate: z.date().optional(),
});

type TicketDetailsSchema = z.infer<typeof ticketDetailsSchema>;

interface TicketDetailsStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const TicketDetailsStep = ({ formData, updateFormData }: TicketDetailsStepProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<TicketDetailsSchema>({
    resolver: zodResolver(ticketDetailsSchema),
    defaultValues: {
      ticketNumber: formData.ticketNumber,
      issueDate: formData.issueDate,
      location: formData.location,
      officer: formData.officer,
      officerBadge: formData.officerBadge,
      offenceSection: formData.offenceSection,
      offenceSubSection: formData.offenceSubSection,
      offenceDescription: formData.offenceDescription,
      violation: formData.violation,
      fineAmount: formData.fineAmount,
      courtDate: formData.courtDate,
    },
  });

  const issueDate = watch("issueDate");
  const courtDate = watch("courtDate");

  const handleFieldUpdate = (field: keyof TicketDetailsSchema | keyof FormData, value: any) => {
    if (field in formData) {
      setValue(field as keyof TicketDetailsSchema, value);
    }
    updateFormData({ [field]: value });
  };

  const processTicketOCR = async (file: File) => {
    setIsProcessingOCR(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const imageBase64 = await base64Promise;

      // Call OCR edge function
      const { data, error } = await supabase.functions.invoke('ocr-ticket', {
        body: { imageBase64 }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const extracted = data.data;
        
        // Auto-fill fields with extracted data
        if (extracted.ticketNumber) {
          handleFieldUpdate('ticketNumber', extracted.ticketNumber);
        }
        if (extracted.issueDate) {
          handleFieldUpdate('issueDate', new Date(extracted.issueDate));
        }
        if (extracted.location) {
          handleFieldUpdate('location', extracted.location);
        }
        if (extracted.officer) {
          handleFieldUpdate('officer', extracted.officer);
        }
        if (extracted.officerBadge) {
          handleFieldUpdate('officerBadge', extracted.officerBadge);
        }
        if (extracted.offenceSection) {
          handleFieldUpdate('offenceSection', extracted.offenceSection);
        }
        if (extracted.offenceSubSection) {
          handleFieldUpdate('offenceSubSection', extracted.offenceSubSection);
        }
        if (extracted.offenceDescription) {
          handleFieldUpdate('offenceDescription', extracted.offenceDescription);
        }
        if (extracted.violation) {
          handleFieldUpdate('violation', extracted.violation);
        }
        if (extracted.fineAmount) {
          handleFieldUpdate('fineAmount', `$${extracted.fineAmount}`);
        }
        if (extracted.courtDate) {
          handleFieldUpdate('courtDate', new Date(extracted.courtDate));
        }

        toast({
          title: "Ticket scanned successfully!",
          description: "Form fields have been auto-filled. Please review and correct any errors.",
        });
      }
    } catch (error) {
      console.error('OCR error:', error);
      toast({
        title: "Could not read ticket",
        description: "Please fill in the form manually.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const handleFileUpload = (file: File) => {
    const isImageMime = file.type?.startsWith('image/');
    const name = file.name.toLowerCase();
    const isHeic = name.endsWith('.heic') || name.endsWith('.heif');
    if (isImageMime || isHeic) {
      updateFormData({ ticketImage: file });
      // Trigger OCR processing
      processTicketOCR(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const violationTypes = [
    "Speeding (1-15 km/h over)",
    "Speeding (16-30 km/h over)",
    "Speeding (31+ km/h over)",
    "Red Light Violation",
    "Stop Sign Violation", 
    "Distracted Driving",
    "Careless Driving",
    "Improper Lane Change",
    "Following Too Closely",
    "Improper Turn",
    "Parking Violation",
    "Other"
  ];

  const openFileDialog = () => {
    const input = fileInputRef.current;
    if (!input) return;
    try {
      // Allow re-selecting the same file name
      (input as any).value = "";
    } catch {}
    const anyInput = input as any;
    if (typeof anyInput.showPicker === "function") {
      try {
        anyInput.showPicker();
        return;
      } catch {}
    }
    input.click();
  };

  return (
    <form className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="ticketNumber">Ticket Number *</Label>
          <Input
            id="ticketNumber"
            {...register("ticketNumber")}
            onBlur={(e) => handleFieldUpdate("ticketNumber", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
            placeholder="e.g., AB123456789"
          />
          {errors.ticketNumber && (
            <p className="text-sm text-destructive">{errors.ticketNumber.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Issue Date *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal transition-smooth focus:ring-2 focus:ring-primary/20",
                  !issueDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {issueDate ? format(issueDate, "PPP") : <span>Select date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={issueDate}
                onSelect={(date) => handleFieldUpdate("issueDate", date)}
                disabled={(date) => date > new Date()}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {errors.issueDate && (
            <p className="text-sm text-destructive">{errors.issueDate.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location of Violation *</Label>
        <Input
          id="location"
          {...register("location")}
          onBlur={(e) => handleFieldUpdate("location", e.target.value)}
          className="transition-smooth focus:ring-2 focus:ring-primary/20"
          placeholder="e.g., Highway 2 near Calgary, Main St & 1st Ave"
        />
        {errors.location && (
          <p className="text-sm text-destructive">{errors.location.message}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="officer">Officer Name *</Label>
          <Input
            id="officer"
            {...register("officer")}
            onBlur={(e) => handleFieldUpdate("officer", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
            placeholder="Officer last name"
          />
          {errors.officer && (
            <p className="text-sm text-destructive">{errors.officer.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="officerBadge">Officer Badge Number</Label>
          <Input
            id="officerBadge"
            {...register("officerBadge")}
            onBlur={(e) => handleFieldUpdate("officerBadge", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
            placeholder="Badge number (if available)"
          />
          {errors.officerBadge && (
            <p className="text-sm text-destructive">{errors.officerBadge.message}</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="fineAmount">Fine Amount *</Label>
          <Input
            id="fineAmount"
            {...register("fineAmount")}
            onBlur={(e) => handleFieldUpdate("fineAmount", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
            placeholder="$150"
          />
          {errors.fineAmount && (
            <p className="text-sm text-destructive">{errors.fineAmount.message}</p>
          )}
        </div>

        <div className="space-y-2">
          {/* Empty div for grid alignment */}
        </div>
      </div>

      {/* Offence Details Section */}
      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-muted">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Offence Details</h3>
          <span className="text-xs text-muted-foreground">(Optional - helps with defense strategy)</span>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="offenceSection">Section #</Label>
            <Input
              id="offenceSection"
              {...register("offenceSection")}
              onBlur={(e) => handleFieldUpdate("offenceSection", e.target.value)}
              className="transition-smooth focus:ring-2 focus:ring-primary/20"
              placeholder="e.g., 86"
            />
            {errors.offenceSection && (
              <p className="text-sm text-destructive">{errors.offenceSection.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="offenceSubSection">Sub-Section #</Label>
            <Input
              id="offenceSubSection"
              {...register("offenceSubSection")}
              onBlur={(e) => handleFieldUpdate("offenceSubSection", e.target.value)}
              className="transition-smooth focus:ring-2 focus:ring-primary/20"
              placeholder="e.g., (4)(c)"
            />
            {errors.offenceSubSection && (
              <p className="text-sm text-destructive">{errors.offenceSubSection.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="offenceDescription" className="sr-only">Description</Label>
            <div className="h-6"></div>
            {/* Spacer to align with other fields */}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="offenceDescription">Offence Description</Label>
          <Textarea
            id="offenceDescription"
            {...register("offenceDescription")}
            onBlur={(e) => handleFieldUpdate("offenceDescription", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20 min-h-[60px]"
            placeholder="e.g., Fail to carry proof of registration or license plate"
          />
          {errors.offenceDescription && (
            <p className="text-sm text-destructive">{errors.offenceDescription.message}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          💡 <strong>Tip:</strong> These details are typically found in the "DID UNLAWFULLY CONTRAVENE SECTION" area of your ticket.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Violation Type *</Label>
        <Select
          value={formData.violation}
          onValueChange={(value) => handleFieldUpdate("violation", value)}
        >
          <SelectTrigger className="transition-smooth focus:ring-2 focus:ring-primary/20">
            <SelectValue placeholder="Select the type of violation" />
          </SelectTrigger>
          <SelectContent>
            {violationTypes.map((violation) => (
              <SelectItem key={violation} value={violation}>
                {violation}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.violation && (
          <p className="text-sm text-destructive">{errors.violation.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Court Date (if scheduled)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal transition-smooth focus:ring-2 focus:ring-primary/20",
                !courtDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {courtDate ? format(courtDate, "PPP") : <span>No court date yet</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={courtDate}
              onSelect={(date) => handleFieldUpdate("courtDate", date)}
              disabled={(date) => date < new Date()}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Jurisdiction Checker */}
      <JurisdictionChecker 
        initialLocation={formData.location || ""}
        onResult={(result) => {
          if (result) {
            console.log('Jurisdiction result:', result);
          }
        }}
      />

      {/* Vehicle Seizure Checkbox */}
      <div className="space-y-4 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="vehicleSeized"
            checked={formData.vehicleSeized}
            onCheckedChange={(checked) => handleFieldUpdate("vehicleSeized", checked)}
            className="mt-1"
          />
          <div className="space-y-2">
            <Label htmlFor="vehicleSeized" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              My vehicle was seized
            </Label>
            <p className="text-sm text-muted-foreground">
              Check this box if your vehicle was impounded or seized in connection with this ticket.
            </p>
          </div>
        </div>
        
        {formData.vehicleSeized && (
          <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 mt-4">
            <div className="flex items-center gap-3 mb-2">
              <Download className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">Required Form</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Since your vehicle was seized, you'll need to complete Form SRA12675 (Written Consent). 
              Please download, print, sign, and bring this form to your consultation.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-primary border-primary hover:bg-primary/10"
              onClick={() => {
                const link = document.createElement('a');
                link.href = '/forms/Form-SRA12675-Written-Consent.pdf';
                link.download = 'Form-SRA12675-Written-Consent.pdf';
                link.click();
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Form SRA12675
            </Button>
          </div>
        )}
      </div>

      {/* File Upload */}
      <div className="space-y-2">
        <Label>Upload Ticket Image</Label>
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-smooth cursor-pointer hover:border-primary/50",
            dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            formData.ticketImage && "border-primary/50 bg-primary/5"
          )}
          onClick={openFileDialog}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFileDialog(); } }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload ticket image"
        >
          <input
            id="ticketUpload"
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="image/*,.heic,.heif,application/pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
          
          {formData.ticketImage ? (
            <div className="space-y-2">
              <FileImage className="h-12 w-12 text-primary mx-auto" />
              <p className="text-sm font-medium text-primary">
                {formData.ticketImage.name}
              </p>
              {isProcessingOCR ? (
                <div className="flex items-center gap-2 justify-center text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-xs">Reading ticket...</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click to change or drag a new image
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">
                Drag & drop your ticket image here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                All image formats supported (JPG, PNG, HEIC, etc.) • Max 10MB
              </p>
              <p className="text-xs text-primary font-medium">
                ✨ We'll automatically fill in the details for you!
              </p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          A clear photo of your ticket helps our experts analyze your case more effectively.
        </p>
      </div>

      <div className="bg-secondary/5 p-4 rounded-lg border border-secondary/10">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-secondary">Pro Tip:</span> The more accurate information 
          you provide, the better we can defend your case. Double-check all details match your ticket exactly.
        </p>
      </div>

      {/* Instant Ticket Analyzer */}
      <InstantTicketAnalyzer 
        ticketImage={formData.ticketImage}
        fineAmount={formData.fineAmount}
        violation={formData.violation}
      />
    </form>
  );
};

export default TicketDetailsStep;