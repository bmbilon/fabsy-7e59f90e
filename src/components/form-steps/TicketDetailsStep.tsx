import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Upload, FileImage, Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import { albertaCourts } from "@/data/albertaCourts";
import InstantTicketAnalyzer from "../InstantTicketAnalyzer";
import { FormData } from "../TicketForm";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { albertaTrafficActSections, TrafficActSection } from "@/data/albertaTrafficAct";

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
  const [hasProcessedInitialImage, setHasProcessedInitialImage] = useState(false);
  const [openOffenceCombobox, setOpenOffenceCombobox] = useState(false);
  const [offenceSearchValue, setOffenceSearchValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
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
      fineAmount: formData.fineAmount,
      courtDate: formData.courtDate,
    },
  });

  // Keep RHF form state in sync when parent formData updates (e.g., from OCR/localStorage)
  useEffect(() => {
    reset({
      ticketNumber: formData.ticketNumber,
      issueDate: formData.issueDate,
      location: formData.location,
      officer: formData.officer,
      officerBadge: formData.officerBadge,
      offenceSection: formData.offenceSection,
      offenceSubSection: formData.offenceSubSection,
      offenceDescription: formData.offenceDescription,
      fineAmount: formData.fineAmount,
      courtDate: formData.courtDate,
    });
  }, [formData.ticketNumber, formData.issueDate, formData.location, formData.officer, formData.officerBadge, formData.offenceSection, formData.offenceSubSection, formData.offenceDescription, formData.fineAmount, formData.courtDate, reset]);

  const issueDate = watch("issueDate");
  const courtDate = watch("courtDate");

  // Determine if OCR data has already populated the form
  const hasOCRData = Boolean(
    formData.ticketNumber ||
    formData.fineAmount ||
    formData.offenceDescription ||
    formData.officer ||
    formData.officerBadge ||
    formData.offenceSection ||
    formData.offenceSubSection ||
    formData.location ||
    formData.issueDate ||
    formData.courtDate
  );

  // Process ticket image on mount if it was uploaded from Hero page
  useEffect(() => {
    if (formData.ticketImage && !hasProcessedInitialImage && !formData.ticketNumber) {
      console.log('[Mount] Processing initial ticket image from Hero page');
      setHasProcessedInitialImage(true);
      processTicketOCR(formData.ticketImage);
    }
  }, [formData.ticketImage]);

  const handleFieldUpdate = (field: keyof TicketDetailsSchema | keyof FormData, value: unknown) => {
    if (field in formData) {
      setValue(field as keyof TicketDetailsSchema, value as TicketDetailsSchema[keyof TicketDetailsSchema]);
    }
    updateFormData({ [field]: value } as Partial<FormData>);
  };

  const processTicketOCR = async (file: File) => {
    console.log('[OCR] Starting ticket OCR process with file:', file.name, file.type);
    setIsProcessingOCR(true);
    try {
      // Convert file to base64
      console.log('[OCR] Converting file to base64...');
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          console.log('[OCR] File converted to base64, length:', result.length);
          resolve(result);
        };
        reader.onerror = (error) => {
          console.error('[OCR] FileReader error:', error);
          reject(error);
        };
      });
      reader.readAsDataURL(file);
      const imageBase64 = await base64Promise;

      // Call OCR edge function
      console.log('[OCR] Calling ocr-ticket edge function...');
      const { data, error } = await supabase.functions.invoke('ocr-ticket', {
        body: { imageBase64 }
      });

      console.log('[OCR] Edge function response:', { data, error });

      if (error) {
        console.error('[OCR] Edge function error:', error);
        throw error;
      }

      // Support both shapes:
      // 1) { success: true, data: {...} }
      // 2) { ...extractedFields }
      const rawUnknown: unknown = data;
      let extracted: Record<string, unknown> | null = null;
      if (rawUnknown && typeof rawUnknown === 'object') {
        const rawObj = rawUnknown as Record<string, unknown>;
        const success = (rawObj as { success?: boolean }).success === true;
        if (success && 'data' in rawObj && typeof rawObj.data === 'object' && rawObj.data !== null) {
          extracted = rawObj.data as Record<string, unknown>;
        } else {
          extracted = rawObj;
        }
      }

      if (extracted) {
        // Helpers
        const getStr = (k: string): string | null => {
          const v = extracted![k];
          return typeof v === 'string' && v.trim() ? v : null;
        };
        const getNumStr = (k: string): string | null => {
          const v = extracted![k];
          if (typeof v === 'number') return String(v);
          if (typeof v === 'string' && v.trim()) return v.trim();
          return null;
        };

        // Normalize keys from edge fn -> form schema
        const norm = {
          ticketNumber: getStr('ticketNumber'),
          issueDate: getStr('issueDate'),
          location: getStr('location'),
          officer: getStr('officer'),
          officerBadge: getStr('officerBadge'),
          offenceSection: getStr('offenceSection') ?? getStr('section'),
          offenceSubSection: getStr('offenceSubSection') ?? getStr('subsection'),
          offenceDescription: getStr('offenceDescription') ?? getStr('offenseDescription'),
          violation: getStr('violation'),
          fineAmount: (() => {
            const fa = getNumStr('fineAmount');
            const f = getNumStr('fine');
            const val = fa ?? f;
            if (!val) return null;
            return val.startsWith('$') ? val : `$${val}`;
          })(),
          courtDate: getStr('courtDate'),
        } as Record<string, string | null>;

        console.log('[OCR] Extracted normalized data:', norm);
        
        // Auto-fill fields with extracted data if present
        if (norm.ticketNumber) {
          handleFieldUpdate('ticketNumber', norm.ticketNumber);
        }
        if (norm.issueDate) {
          const d = new Date(norm.issueDate);
          if (!isNaN(d.getTime())) handleFieldUpdate('issueDate', d);
        }
        if (norm.location) {
          handleFieldUpdate('location', norm.location);
        }
        if (norm.officer) {
          handleFieldUpdate('officer', norm.officer);
        }
        if (norm.officerBadge) {
          handleFieldUpdate('officerBadge', norm.officerBadge);
        }
        if (norm.offenceSection) {
          handleFieldUpdate('offenceSection', norm.offenceSection);
        }
        if (norm.offenceSubSection) {
          handleFieldUpdate('offenceSubSection', norm.offenceSubSection);
        }
        if (norm.offenceDescription) {
          handleFieldUpdate('offenceDescription', norm.offenceDescription);
        }
        if (norm.violation) {
          handleFieldUpdate('violation', norm.violation);
        }
        if (norm.fineAmount) {
          handleFieldUpdate('fineAmount', norm.fineAmount);
        }
        if (norm.courtDate) {
          const cd = new Date(norm.courtDate);
          if (!isNaN(cd.getTime())) handleFieldUpdate('courtDate', cd);
        }

        toast({
          title: "Ticket scanned successfully!",
          description: "Form fields have been auto-filled. Please review and correct any errors.",
        });
      } else {
        console.warn('[OCR] No data returned from OCR function');
        toast({
          title: "Could not extract data",
          description: "Please fill in the form manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('[OCR] Error during OCR process:', error);
      toast({
        title: "Could not read ticket",
        description: "Please fill in the form manually.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingOCR(false);
      console.log('[OCR] OCR process completed');
    }
  };

  const handleFileUpload = (file: File) => {
    console.log('[Upload] File selected:', file.name, file.type, file.size);
    const isImageMime = file.type?.startsWith('image/');
    const name = file.name.toLowerCase();
    const isHeic = name.endsWith('.heic') || name.endsWith('.heif');
    console.log('[Upload] File check - isImageMime:', isImageMime, 'isHeic:', isHeic);
    if (isImageMime || isHeic) {
      console.log('[Upload] Valid image file, updating formData and triggering OCR');
      updateFormData({ ticketImage: file });
      // Trigger OCR processing
      processTicketOCR(file);
    } else {
      console.warn('[Upload] Invalid file type, skipping');
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

  
  const handleOffenceSelect = (section: TrafficActSection) => {
    handleFieldUpdate("offenceSection", section.section);
    handleFieldUpdate("offenceSubSection", section.subsection);
    handleFieldUpdate("offenceDescription", section.description);
    setOpenOffenceCombobox(false);
    setOffenceSearchValue("");
    
    toast({
      title: "Offence details auto-filled",
      description: `Section ${section.section}${section.subsection} applied`,
    });
  };

  const filteredSections = offenceSearchValue
    ? albertaTrafficActSections.filter((section) =>
        section.searchText.toLowerCase().includes(offenceSearchValue.toLowerCase())
      )
    : albertaTrafficActSections;

  // Get unique sections, subsections for current section, and descriptions
  const uniqueSections = Array.from(new Set(albertaTrafficActSections.map(s => s.section))).sort((a, b) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    return numA - numB;
  });

  const availableSubsections = formData.offenceSection
    ? Array.from(new Set(
        albertaTrafficActSections
          .filter(s => s.section === formData.offenceSection)
          .map(s => s.subsection)
      ))
    : [];

  const availableDescriptions = formData.offenceSection && formData.offenceSubSection
    ? albertaTrafficActSections
        .filter(s => s.section === formData.offenceSection && s.subsection === formData.offenceSubSection)
        .map(s => s.description)
    : formData.offenceSection
    ? albertaTrafficActSections
        .filter(s => s.section === formData.offenceSection)
        .map(s => s.description)
    : [];

  const openFileDialog = () => {
    const input = fileInputRef.current;
    if (!input) return;
    try {
      // Allow re-selecting the same file name
      (input as HTMLInputElement).value = "";
    } catch {
      // noop
    }
    const anyInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyInput.showPicker === "function") {
      try {
        anyInput.showPicker();
        return;
      } catch {
        // noop
      }
    }
    input.click();
  };

  return (
    <>
      {/* OCR Processing Modal */}
      {isProcessingOCR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-card rounded-lg p-8 max-w-md mx-4 shadow-elevated">
            <div className="flex flex-col items-center text-center space-y-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground">
                Processing Your Ticket
              </h3>
              <p className="text-gray-700 dark:text-muted-foreground">
                Reading ticket details using OCR technology. This will only take a moment...
              </p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-primary animate-pulse" style={{ width: '60%' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <form className="space-y-8">
      {/* Basic Ticket Information */}
      <Card className="p-6 bg-gradient-card border-2 border-primary/10">
        <h3 className="text-lg font-semibold mb-4 text-primary">Ticket Information</h3>
        
        {/* Ticket Upload - Show only when no prior OCR data or image is present */}
        {!(formData.ticketImage || hasOCRData) && (
          <div className="mb-6 p-4 bg-gradient-soft border border-primary/30 rounded-lg">
            <div className="mb-3">
              <Label className="font-medium text-primary">Upload Your Ticket</Label>
              <p className="text-sm text-muted-foreground mt-1">Upload a photo to auto-fill the form fields below</p>
            </div>
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-smooth cursor-pointer hover:border-primary/50",
                dragActive ? "border-primary bg-primary/5" : "border-primary/30"
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
                id="ticketUploadTop"
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
              
              <div className="space-y-2">
                <Upload className="h-8 w-8 text-primary/70 mx-auto" />
                <p className="text-sm font-medium text-primary">
                  Drag & drop your ticket or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, HEIC, PDF • Max 10MB
                </p>
                <p className="text-xs text-primary font-medium">
                  ✨ We'll automatically fill in the details!
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Show uploaded ticket status if already uploaded */}
        {formData.ticketImage && (
          <div className="mb-6 p-3 bg-white/50 dark:bg-white/10 rounded-lg border border-primary/30">
            <div className="flex items-center gap-3">
              <FileImage className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">Ticket Uploaded</p>
                <p className="text-xs text-muted-foreground">{formData.ticketImage.name}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openFileDialog}
                className="text-xs h-8"
              >
                Change
              </Button>
            </div>
          </div>
        )}
        
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticketNumber" className="font-medium">Ticket Number *</Label>
              <Input
                id="ticketNumber"
                {...register("ticketNumber")}
                onBlur={(e) => handleFieldUpdate("ticketNumber", e.target.value)}
                className="h-11"
                placeholder="AB123456789"
              />
              {errors.ticketNumber && (
                <p className="text-sm text-destructive">{errors.ticketNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Issue Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-11 justify-start text-left font-normal",
                      !issueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {issueDate ? format(issueDate, "MMM dd, yyyy") : "Select date"}
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
            <Label htmlFor="location" className="font-medium">Location *</Label>
            <Input
              id="location"
              {...register("location")}
              onBlur={(e) => handleFieldUpdate("location", e.target.value)}
              className="h-11"
              placeholder="Highway 2 near Calgary, Main St & 1st Ave"
            />
            {errors.location && (
              <p className="text-sm text-destructive">{errors.location.message}</p>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fineAmount" className="font-medium">Fine Amount *</Label>
              <Input
                id="fineAmount"
                {...register("fineAmount")}
                onBlur={(e) => handleFieldUpdate("fineAmount", e.target.value)}
                className="h-11"
                placeholder="$150"
              />
              {errors.fineAmount && (
                <p className="text-sm text-destructive">{errors.fineAmount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Court Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-11 justify-start text-left font-normal",
                      !courtDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {courtDate ? format(courtDate, "MMM dd, yyyy") : "Not set"}
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
          </div>
        </div>
      </Card>

      {/* Officer Information */}
      <Card className="p-6 bg-gradient-card border-2 border-primary/10">
        <h3 className="text-lg font-semibold mb-4 text-primary">Officer Details</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="officer" className="font-medium">Officer Name *</Label>
            <Input
              id="officer"
              {...register("officer")}
              onBlur={(e) => handleFieldUpdate("officer", e.target.value)}
              className="h-11"
              placeholder="Last name"
            />
            {errors.officer && (
              <p className="text-sm text-destructive">{errors.officer.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="officerBadge" className="font-medium">Badge Number</Label>
            <Input
              id="officerBadge"
              {...register("officerBadge")}
              onBlur={(e) => handleFieldUpdate("officerBadge", e.target.value)}
              className="h-11"
              placeholder="Optional"
            />
          </div>
        </div>
      </Card>

      {/* Court Jurisdiction */}
      <div className="space-y-2">
        <Label htmlFor="court-jurisdiction">Court Location (Jurisdiction)</Label>
        <Select
          value={formData.courtJurisdiction}
          onValueChange={(value) => {
            const court = albertaCourts.find(c => c.name === value);
            handleFieldUpdate("courtJurisdiction", value);
            handleFieldUpdate("agentRepresentationPermitted", court ? court.agentsPermitted : null);
          }}
        >
          <SelectTrigger id="court-jurisdiction">
            <SelectValue placeholder="Select court location" />
          </SelectTrigger>
          <SelectContent>
            {albertaCourts.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {formData.courtJurisdiction && (
          <div className={cn(
            "p-3 rounded-md border",
            formData.agentRepresentationPermitted === true
              ? "border-primary/40 bg-primary/5"
              : "border-destructive/40 bg-destructive/5"
          )}>
            <p className="text-sm">
              Agent representation permitted:{" "}
              <span className="font-semibold">
                {formData.agentRepresentationPermitted ? "Yes" : "No"}
              </span>
            </p>
            {!formData.agentRepresentationPermitted && (
              <p className="text-xs text-muted-foreground mt-1">
                We can still assist with guidance or refer you to appropriate counsel.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Offence Details Section */}
      <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-muted">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Offence Details</h3>
          <span className="text-xs text-muted-foreground">(Optional - helps with defense strategy)</span>
        </div>

        {/* Alberta Traffic Act Search */}
        <div className="space-y-2">
          <Label>Search Alberta Highway Traffic Act</Label>
          <Popover open={openOffenceCombobox} onOpenChange={setOpenOffenceCombobox}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openOffenceCombobox}
                className="w-full justify-between h-auto min-h-10 py-2"
              >
                <span className="text-left">
                  {formData.offenceSection && formData.offenceDescription
                    ? `${formData.offenceSection}${formData.offenceSubSection} - ${formData.offenceDescription}`
                    : "Type to search sections..."}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0" align="start">
              <div className="flex flex-col">
                <div className="flex items-center border-b px-3">
                  <Input
                    placeholder="Search by section number or description..."
                    value={offenceSearchValue}
                    onChange={(e) => setOffenceSearchValue(e.target.value)}
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  {offenceSearchValue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setOffenceSearchValue("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto p-1">
                  {filteredSections.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No matching sections found.
                    </div>
                  ) : (
                    filteredSections.map((section, index) => (
                      <button
                        key={index}
                        onClick={() => handleOffenceSelect(section)}
                        className={cn(
                          "w-full flex items-start gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                          formData.offenceSection === section.section &&
                          formData.offenceSubSection === section.subsection &&
                          "bg-accent"
                        )}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0 mt-0.5",
                            formData.offenceSection === section.section &&
                            formData.offenceSubSection === section.subsection
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            Sec. {section.section}{section.subsection}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {section.description}
                          </span>
                          <span className="text-xs text-primary/60 font-medium">
                            {section.act}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            💡 Start typing to search by section number or description (e.g., "86", "speeding", "registration")
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="offenceSection">Section #</Label>
            <Select
              value={formData.offenceSection}
              onValueChange={(value) => {
                handleFieldUpdate("offenceSection", value);
                handleFieldUpdate("offenceSubSection", "");
                handleFieldUpdate("offenceDescription", "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {uniqueSections.map((section) => (
                  <SelectItem key={section} value={section}>
                    Section {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="offenceSection"
              value={formData.offenceSection}
              onChange={(e) => handleFieldUpdate("offenceSection", e.target.value)}
              className="bg-white dark:bg-white dark:text-foreground transition-smooth focus:ring-2 focus:ring-primary/20"
              placeholder="e.g., 86"
            />
            {errors.offenceSection && (
              <p className="text-sm text-destructive">{errors.offenceSection.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="offenceSubSection">Sub-Section #</Label>
            <Select
              value={formData.offenceSubSection}
              onValueChange={(value) => {
                handleFieldUpdate("offenceSubSection", value);
                handleFieldUpdate("offenceDescription", "");
              }}
              disabled={!formData.offenceSection}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subsection" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {availableSubsections.map((subsection) => (
                  <SelectItem key={subsection} value={subsection}>
                    {subsection}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="offenceSubSection"
              value={formData.offenceSubSection}
              onChange={(e) => handleFieldUpdate("offenceSubSection", e.target.value)}
              className="bg-white dark:bg-white dark:text-foreground transition-smooth focus:ring-2 focus:ring-primary/20"
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
          <Select
            value={formData.offenceDescription}
            onValueChange={(value) => handleFieldUpdate("offenceDescription", value)}
            disabled={!formData.offenceSection}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select description" />
            </SelectTrigger>
            <SelectContent className="max-h-[200px]">
              {availableDescriptions.map((description, index) => (
                <SelectItem key={index} value={description}>
                  {description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            id="offenceDescription"
            value={formData.offenceDescription}
            onChange={(e) => handleFieldUpdate("offenceDescription", e.target.value)}
            className="bg-white dark:bg-white dark:text-foreground transition-smooth focus:ring-2 focus:ring-primary/20 min-h-[60px]"
            placeholder="e.g., Fail to carry proof of registration or license plate"
          />
          {errors.offenceDescription && (
            <p className="text-sm text-destructive">{errors.offenceDescription.message}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          💡 <strong>Tip:</strong> Use the search above or manually enter details from the "DID UNLAWFULLY CONTRAVENE SECTION" area of your ticket.
        </p>
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



      <div className="bg-secondary/5 p-4 rounded-lg border border-secondary/10">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-secondary">Pro Tip:</span> The more accurate information 
          you provide, the better we can defend your case. Double-check all details match your ticket exactly.
        </p>
      </div>

      {/* Instant Ticket Analyzer - Shows AI analysis when ticket details are provided */}
      {formData.ticketImage && formData.fineAmount && formData.offenceDescription && (
        <InstantTicketAnalyzer 
          ticketImage={formData.ticketImage}
          fineAmount={formData.fineAmount}
          violation={formData.offenceDescription}
          section={formData.offenceSection}
          subsection={formData.offenceSubSection}
          officer={formData.officer}
          officerBadge={formData.officerBadge}
          ticketNumber={formData.ticketNumber}
          location={formData.location}
          date={formData.issueDate?.toISOString()}
          courtDate={formData.courtDate}
        />
      )}
    </form>
    </>
  );
};

export default TicketDetailsStep;