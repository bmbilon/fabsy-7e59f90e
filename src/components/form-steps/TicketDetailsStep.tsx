import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, Check, ChevronsUpDown, X } from "lucide-react";
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
import { albertaCourts } from "@/data/albertaCourts";
import InstantTicketAnalyzer from "../InstantTicketAnalyzer";
import TicketCapture, { type TicketOcrData } from "../TicketCapture";
import TicketTypeFields from "../TicketTypeFields";
import { detectTicketType, resetTicketTypeForUpload, ticketDateAsLocalDate, ticketDateFromExtraction } from "@/lib/ticket/ticketType";
import { FormData } from "../TicketForm";
import type { TicketCaptureState } from "@/lib/ticket/ticketCapture";
import { hasTicketReviewData, ticketFieldNeedsReview, type TicketReviewField } from "@/lib/ticket/ticketReview";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { albertaTrafficActSections, TrafficActSection } from "@/data/albertaTrafficAct";

const ticketDetailsSchema = z.object({
  ticketNumber: z.string().min(1, "Ticket number is required"),
  issueDate: z.date({
    required_error: "Issue date is required",
  }),
  location: z.string().min(5, "Please provide the location where you received the ticket"),
  officer: z.string().optional(),
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
  updateFormData: (updates: Partial<FormData> | ((current: FormData) => Partial<FormData>)) => void;
  reviewReady?: boolean;
  skipInitialScan?: boolean;
  onCaptureStateChange?: (state: TicketCaptureState) => void;
}

const TicketDetailsStep = ({ formData, updateFormData, reviewReady = hasTicketReviewData(formData), skipInitialScan = false, onCaptureStateChange }: TicketDetailsStepProps) => {
  const [openOffenceCombobox, setOpenOffenceCombobox] = useState(false);
  const [offenceSearchValue, setOffenceSearchValue] = useState("");
  const manuallyEditedDate = useRef<Date | string | undefined>(formData.issueDate);
  const lastExtraction = useRef<TicketOcrData | null>(null);
  const { toast } = useToast();
  
  const {
    register,
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

  const needsReview = (field: TicketReviewField) => reviewReady && ticketFieldNeedsReview(field, formData[field]);
  const reviewBorder = (field: TicketReviewField) => needsReview(field) ? "border-destructive focus-visible:ring-destructive" : undefined;
  const reviewHint = (field: TicketReviewField, optional = false) => needsReview(field) ? (
    <p id={`${field}-scan-help`} className="text-xs text-destructive">
      {optional ? "Not captured. Add this if it is printed on your ticket; otherwise leave it blank." : "Not captured. Check your ticket and enter this detail."}
    </p>
  ) : null;
  const reviewDescription = (field: TicketReviewField) => needsReview(field) ? `${field}-scan-help` : undefined;

  const handleFieldUpdate = (field: keyof TicketDetailsSchema | keyof FormData, value: unknown) => {
    if (field === "issueDate") manuallyEditedDate.current = value instanceof Date ? value : "";
    if (field in formData) {
      setValue(field as keyof TicketDetailsSchema, value as TicketDetailsSchema[keyof TicketDetailsSchema]);
    }
    updateFormData({ [field]: value } as Partial<FormData>);
  };

  const applyTicketOCR = (extracted: TicketOcrData | null) => {
    if (!extracted) return;
    lastExtraction.current = extracted;
    const updates: Partial<FormData> = {};
    const textFields = ["ticketNumber", "location", "officer", "officerBadge", "offenceSection", "offenceSubSection", "offenceDescription", "violation", "courtJurisdiction"] as const;
    for (const key of textFields) {
      if (typeof extracted[key] === "string" && extracted[key].trim()) updates[key] = extracted[key].trim();
    }
    for (const key of ["courtDate"] as const) {
      if (typeof extracted[key] === "string") {
        const date = ticketDateAsLocalDate(extracted[key]);
        if (date) updates[key] = date;
      }
    }
    const fine = extracted.fineAmount ?? extracted.fine;
    if (typeof fine === "string" || typeof fine === "number") updates.fineAmount = String(fine).replace(/[$,\s]/g, "");
    if (!updates.offenceSection && typeof extracted.section === "string") updates.offenceSection = extracted.section;
    if (!updates.offenceSubSection && typeof extracted.subsection === "string") updates.offenceSubSection = extracted.subsection;
    if (!updates.offenceDescription && typeof extracted.offenseDescription === "string") updates.offenceDescription = extracted.offenseDescription;
    const detected = detectTicketType(extracted);
    updateFormData(current => {
      const ticketType = current.ticketTypeSource === "manual" ? current.ticketType : detected ?? current.ticketType;
      const date = ticketDateFromExtraction(extracted, ticketType, ticketType === current.ticketType ? manuallyEditedDate.current : undefined);
      return {
        ...updates,
        ...(detected ? { ticketType: detected, ticketTypeSource: "upload" as const } : {}),
        issueDate: ticketDateAsLocalDate(date),
      };
    });
  };

  
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

  return (
    <>
      <form className="space-y-8" onSubmit={event => event.preventDefault()}>
        <TicketCapture
          file={formData.ticketImage}
          onFileChange={ticketImage => {
            manuallyEditedDate.current = undefined;
            lastExtraction.current = null;
            onCaptureStateChange?.(ticketImage ? "processing" : "empty");
            updateFormData(current => ({
              ...resetTicketTypeForUpload(current),
              ticketImage,
              ticketNumber: "", plateNumber: "", issueDate: undefined,
              location: "", officer: "", officerBadge: "", offenceSection: "",
              offenceSubSection: "", offenceDescription: "", violation: "", fineAmount: "",
              courtDate: undefined, courtJurisdiction: "", agentRepresentationPermitted: null,
              vehicleSeized: false, sourceAssessmentId: "", sourceAssessmentAccessToken: "",
            }));
          }}
          onOcrData={applyTicketOCR}
          onCaptureStateChange={onCaptureStateChange}
          required={!formData.sourceAssessmentId}
          skipInitialScan={skipInitialScan}
        />
        {formData.sourceAssessmentId && !formData.ticketImage ? <p className="text-sm text-muted-foreground">The ticket from your earlier intake is already linked to this matter.</p> : null}

      {reviewReady && <div className="space-y-6 animate-in fade-in duration-300">
        <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <h3 className="font-semibold">Review your ticket details</h3>
          <p className="mt-1 text-sm text-muted-foreground">Check the captured details against your ticket. Red borders show details that need your attention. Fields marked * are required; other details can be left blank if they are not printed on your ticket.</p>
        </div>
      {/* Basic Ticket Information */}
      <Card className="p-4 sm:p-6 bg-gradient-card border-2 border-primary/10">
        <h3 className="text-lg font-semibold mb-4 text-primary">Ticket Information</h3>
        
        <div className="mb-6 space-y-5">
          <TicketTypeFields
            ticketType={formData.ticketType}
            ticketTypeSource={formData.ticketTypeSource}
            registeredOwnerOnOffenceDate={formData.registeredOwnerOnOffenceDate}
            onTicketTypeChange={ticketType => {
              if (ticketType !== formData.ticketType) manuallyEditedDate.current = undefined;
              updateFormData(current => ({
                ticketType,
                ticketTypeSource: "manual",
                ...(ticketType !== current.ticketType ? { issueDate: ticketDateAsLocalDate(ticketDateFromExtraction(lastExtraction.current, ticketType)) } : {}),
              }));
            }}
            onOwnerChange={registeredOwnerOnOffenceDate => updateFormData({ registeredOwnerOnOffenceDate })}
          />
        </div>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticketNumber" className="font-medium">Ticket Number *</Label>
              <Input
                id="ticketNumber"
                {...register("ticketNumber")}
                onChange={(e) => handleFieldUpdate("ticketNumber", e.target.value)}
                className={cn("h-11", reviewBorder("ticketNumber"))}
                aria-invalid={needsReview("ticketNumber")}
                aria-describedby={reviewDescription("ticketNumber")}
                placeholder="AB123456789"
              />
              {reviewHint("ticketNumber")}
              {errors.ticketNumber && (
                <p className="text-sm text-destructive">{errors.ticketNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-issue-date" className="font-medium">{formData.ticketType === "photo_radar" ? "Offence Date *" : "Issue Date *"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="ticket-issue-date"
                    variant="outline"
                    className={cn(
                      "w-full h-11 justify-start text-left font-normal",
                      !issueDate && "text-muted-foreground",
                      reviewBorder("issueDate")
                    )}
                    aria-invalid={needsReview("issueDate")}
                    aria-describedby={reviewDescription("issueDate")}
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
              {reviewHint("issueDate")}
              {formData.ticketType === "photo_radar" && <p className="text-xs text-muted-foreground">Use the offence date printed on the notice, not its issue or mailing date. Enter it manually if the scan could not read it.</p>}
              {errors.issueDate && (
                <p className="text-sm text-destructive">{formData.ticketType === "photo_radar" ? "Offence date is required" : errors.issueDate.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="font-medium">Location *</Label>
            <Input
              id="location"
              {...register("location")}
              onChange={(e) => handleFieldUpdate("location", e.target.value)}
              className={cn("h-11", reviewBorder("location"))}
              aria-invalid={needsReview("location")}
              aria-describedby={reviewDescription("location")}
              placeholder="Highway 2 near Calgary, Main St & 1st Ave"
            />
            {reviewHint("location")}
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
                onChange={(e) => handleFieldUpdate("fineAmount", e.target.value)}
                className={cn("h-11", reviewBorder("fineAmount"))}
                inputMode="decimal"
                aria-invalid={needsReview("fineAmount")}
                aria-describedby={reviewDescription("fineAmount")}
                placeholder="Enter the amount shown on the ticket"
              />
              {reviewHint("fineAmount")}
              {errors.fineAmount && (
                <p className="text-sm text-destructive">{errors.fineAmount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-court-date" className="font-medium">Court Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="ticket-court-date"
                    variant="outline"
                    className={cn(
                      "w-full h-11 justify-start text-left font-normal",
                      !courtDate && "text-muted-foreground",
                      reviewBorder("courtDate")
                    )}
                    aria-describedby={reviewDescription("courtDate")}
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
              {reviewHint("courtDate", true)}
            </div>
          </div>
        </div>
      </Card>

      {/* Officer Information */}
      <Card className="p-4 sm:p-6 bg-gradient-card border-2 border-primary/10">
        <h3 className="text-lg font-semibold mb-4 text-primary">{formData.ticketType === "photo_radar" ? "Notice details" : "Officer Details"}</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
              <Label htmlFor="officer" className="font-medium">Officer or enforcement agency</Label>
            <Input
              id="officer"
              {...register("officer")}
              onChange={(e) => handleFieldUpdate("officer", e.target.value)}
              className={cn("h-11", reviewBorder("officer"))}
              aria-describedby={reviewDescription("officer")}
                placeholder="If shown on the ticket"
            />
            {reviewHint("officer", true)}
            {errors.officer && (
              <p className="text-sm text-destructive">{errors.officer.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="officerBadge" className="font-medium">Badge Number</Label>
            <Input
              id="officerBadge"
              {...register("officerBadge")}
              onChange={(e) => handleFieldUpdate("officerBadge", e.target.value)}
              className={cn("h-11", reviewBorder("officerBadge"))}
              aria-describedby={reviewDescription("officerBadge")}
              placeholder="Optional"
            />
            {reviewHint("officerBadge", true)}
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
              Initial location screen:{" "}
              <span className="font-semibold">
                {formData.agentRepresentationPermitted ? "No location issue flagged" : "Manual review required"}
              </span>
            </p>
            {formData.agentRepresentationPermitted === false && (
              <p className="text-xs text-muted-foreground mt-1">
                Rapid Resolution eligibility still requires Fabsy's review. Do not rely on this
                intake to extend the response date shown on your ticket.
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
            <PopoverContent className="w-[min(500px,calc(100vw-2rem))] p-0" align="start">
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
            Start typing to search by section number or description (e.g., "86", "speeding", "registration")
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
              className={cn("bg-white dark:bg-white dark:text-foreground transition-smooth", reviewBorder("offenceSection"))}
              aria-describedby={reviewDescription("offenceSection")}
              placeholder="e.g., 86"
            />
            {reviewHint("offenceSection", true)}
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
              className={cn("bg-white dark:bg-white dark:text-foreground transition-smooth", reviewBorder("offenceSubSection"))}
              aria-describedby={reviewDescription("offenceSubSection")}
              placeholder="e.g., (4)(c)"
            />
            {reviewHint("offenceSubSection", true)}
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
            className={cn("bg-white dark:bg-white dark:text-foreground transition-smooth min-h-[60px]", reviewBorder("offenceDescription"))}
            aria-describedby={reviewDescription("offenceDescription")}
            placeholder="e.g., Fail to carry proof of registration or license plate"
          />
          {reviewHint("offenceDescription", true)}
          {errors.offenceDescription && (
            <p className="text-sm text-destructive">{errors.offenceDescription.message}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          <strong>Tip:</strong> Use the search above or manually enter details from the "DID UNLAWFULLY CONTRAVENE SECTION" area of your ticket.
        </p>
      </div>

      {/* Vehicle Seizure Checkbox */}
      {formData.ticketType !== "photo_radar" && <div className="space-y-4 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
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
              <AlertTriangle className="h-5 w-5 text-amber-700" />
              <span className="font-semibold text-amber-900">Separate process may apply</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              A vehicle seizure may involve a SafeRoads or other administrative process that is
              outside Rapid Resolution and can have a short deadline. Do not continue to checkout.
              Follow the notice you received and contact Fabsy or an Alberta lawyer promptly.
            </p>
          </div>
        )}
      </div>}



      <div className="bg-secondary/5 p-4 rounded-lg border border-secondary/10">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-secondary">Accuracy matters:</span> The more accurate information
          you provide, the more reliably Fabsy can review the file. Double-check that the details match your ticket.
        </p>
      </div>

      {/* Instant Ticket Analyzer - Shows AI analysis when ticket details are provided */}
      {formData.ticketType !== "photo_radar" && formData.ticketImage && formData.fineAmount && formData.offenceDescription && (
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
      </div>}
    </form>
    </>
  );
};

export default TicketDetailsStep;
