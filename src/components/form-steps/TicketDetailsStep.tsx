import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Upload, FileImage } from "lucide-react";
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
import { FormData } from "../TicketForm";
import { useState } from "react";

const ticketDetailsSchema = z.object({
  ticketNumber: z.string().min(1, "Ticket number is required"),
  issueDate: z.date({
    required_error: "Issue date is required",
  }),
  location: z.string().min(5, "Please provide the location where you received the ticket"),
  officer: z.string().min(2, "Officer name is required"),
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

  const handleFileUpload = (file: File) => {
    if (file.type.startsWith('image/')) {
      updateFormData({ ticketImage: file });
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
            placeholder="Officer last name or badge number"
          />
          {errors.officer && (
            <p className="text-sm text-destructive">{errors.officer.message}</p>
          )}
        </div>

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
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('ticketUpload')?.click()}
        >
          <input
            id="ticketUpload"
            type="file"
            className="hidden"
            accept="image/*"
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
              <p className="text-xs text-muted-foreground">
                Click to change or drag a new image
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">
                Drag & drop your ticket image here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, or PDF • Max 10MB
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
    </form>
  );
};

export default TicketDetailsStep;