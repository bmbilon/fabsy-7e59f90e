import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath, type FieldPathValue } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { Camera, Upload, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormData } from "../TicketForm";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isProLicenceClass, licenceClassHint, licencePhotoAsDataUrl, validateProLicenceFile, type LicenceClass } from "@/lib/pro-drivers/intake";
import { TICKET_CAPTURE_PHOTO_ACCEPT, validateTicketCaptureFile } from "@/lib/ticket/ticketCapture";

const personalInfoSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  address: z.string().min(5, "Please enter your full address"),
  city: z.string().min(2, "Please enter your city"),
  province: z.string().min(1, "Please select your province"),
  postalCode: z.string().regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, "Please enter a valid postal code"),
  dateOfBirth: z.date({
    required_error: "Date of birth is required",
  }),
  driversLicense: z.string().min(5, "Please enter your driver's license number"),
});

type PersonalInfoSchema = z.infer<typeof personalInfoSchema>;

interface PersonalInfoStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const PersonalInfoStep = ({ formData, updateFormData }: PersonalInfoStepProps) => {
  const [imagePreview, setImagePreview] = useState<string>("");
  const [showAddressFields, setShowAddressFields] = useState(formData.addressDifferentFromLicense);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrSucceeded, setOcrSucceeded] = useState(false);
  const [classHint, setClassHint] = useState<LicenceClass>("unknown");
  const scanId = useRef(0);
  const [hasProcessedInitialImage, setHasProcessedInitialImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dobYear, setDobYear] = useState<string>(formData.dateOfBirth ? formData.dateOfBirth.getFullYear().toString() : "");
  const [dobMonth, setDobMonth] = useState<string>(formData.dateOfBirth ? (formData.dateOfBirth.getMonth() + 1).toString() : "");
  const [dobDay, setDobDay] = useState<string>(formData.dateOfBirth ? formData.dateOfBirth.getDate().toString() : "");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const declaredProClass = formData.ticketType !== "photo_radar" && isProLicenceClass(formData.licenceClass);
  const proPhotoUsable = formData.driversLicenseImage ? validateProLicenceFile(formData.driversLicenseImage).valid : false;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<PersonalInfoSchema>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      province: formData.province,
      postalCode: formData.postalCode,
      dateOfBirth: formData.dateOfBirth,
      driversLicense: formData.driversLicense,
    },
  });

  const dateOfBirth = watch("dateOfBirth");

  useEffect(() => {
    if (!formData.driversLicenseImage) { setImagePreview(""); return; }
    const preview = URL.createObjectURL(formData.driversLicenseImage);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [formData.driversLicenseImage]);
  useEffect(() => () => { scanId.current += 1; }, []);

  // Process DL image on mount if it was uploaded from elsewhere
  useEffect(() => {
    if (formData.driversLicenseImage && !hasProcessedInitialImage && !formData.firstName) {
      setHasProcessedInitialImage(true);
      processDLOCR(formData.driversLicenseImage);
    }
  }, [formData.driversLicenseImage]);

  const onSubmit = (data: PersonalInfoSchema) => {
    updateFormData(data);
  };

  // Auto-save on blur
  const handleFieldUpdate = <K extends FieldPath<PersonalInfoSchema>>(
    field: K,
    value: FieldPathValue<PersonalInfoSchema, K>,
  ) => {
    setValue(field, value);
    updateFormData({ [field]: value } as Partial<FormData>);
  };

  // Generate year options (current year - 18 down to 1920)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1920 + 1 }, (_, i) => currentYear - i);
  const months = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  // Handle date component changes
  const handleDateChange = (type: 'year' | 'month' | 'day', value: string) => {
    const newYear = type === 'year' ? value : dobYear;
    const newMonth = type === 'month' ? value : dobMonth;
    const newDay = type === 'day' ? value : dobDay;

    if (type === 'year') setDobYear(value);
    if (type === 'month') setDobMonth(value);
    if (type === 'day') setDobDay(value);

    // If all three are selected, create the date
    if (newYear && newMonth && newDay) {
      const date = new Date(parseInt(newYear), parseInt(newMonth) - 1, parseInt(newDay));
      handleFieldUpdate("dateOfBirth", date);
    }
  };

  const processDLOCR = async (file: File) => {
    const requestId = ++scanId.current;
    setIsProcessingOCR(true);
    setOcrSucceeded(false);
    setClassHint("unknown");
    try {
      const imageBase64 = await licencePhotoAsDataUrl(file);
      const { data, error } = await supabase.functions.invoke('ocr-drivers-license', {
        body: { imageBase64 }
      });
      if (requestId !== scanId.current) return;
      if (error) throw error;

      if (data?.success && data?.data) {
        const extracted = data.data;
        // Autofill is a convenience only. Preserve the driver's declaration;
        // a separate server-bound read controls the discount at checkout.
        setClassHint(licenceClassHint(extracted.licenceClass ?? extracted.licenseClass ?? extracted.licence_class));
        setOcrSucceeded(true);
        
        // Auto-fill fields with extracted data
        if (extracted.firstName) {
          handleFieldUpdate('firstName', extracted.firstName);
        }
        if (extracted.lastName) {
          handleFieldUpdate('lastName', extracted.lastName);
        }
        if (extracted.address) {
          handleFieldUpdate('address', extracted.address);
        }
        if (extracted.city) {
          handleFieldUpdate('city', extracted.city);
        }
        if (extracted.province) {
          handleFieldUpdate('province', extracted.province);
        }
        if (extracted.postalCode) {
          handleFieldUpdate('postalCode', extracted.postalCode);
        }
        if (extracted.dateOfBirth) {
          const date = new Date(extracted.dateOfBirth);
          if (Number.isFinite(date.getTime())) {
            handleFieldUpdate('dateOfBirth', date);
            setDobYear(date.getFullYear().toString());
            setDobMonth((date.getMonth() + 1).toString());
            setDobDay(date.getDate().toString());
          }
        }
        if (extracted.driversLicense) {
          handleFieldUpdate('driversLicense', extracted.driversLicense);
        }

        toast({
          title: "Driver's license scanned successfully!",
          description: "Form fields have been auto-filled. Please review and correct any errors.",
        });
      } else {
        toast({
          title: "Could not extract data",
          description: "Please fill in the form manually.",
          variant: "destructive",
        });
      }
    } catch {
      if (requestId !== scanId.current) return;
      toast({
        title: "Could not read driver's license",
        description: "Please fill in the form manually.",
        variant: "destructive",
      });
    } finally {
      if (requestId === scanId.current) setIsProcessingOCR(false);
    }
  };

  const acceptLicenceImage = (file: File) => {
    const descriptor = validateTicketCaptureFile(file);
    if (!descriptor.valid || descriptor.kind !== "image") {
      toast({ title: "Choose a licence photo", description: "Upload a JPG, PNG, WebP, HEIC or HEIF image, 10 MB or smaller.", variant: "destructive" });
      return;
    }
    setHasProcessedInitialImage(true);
    updateFormData({ driversLicenseImage: file });
    void processDLOCR(file);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) acceptLicenceImage(file);
    event.target.value = "";
  };

  const handleAddressDifferent = (checked: boolean) => {
    setShowAddressFields(checked);
    updateFormData({ addressDifferentFromLicense: checked });
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
      acceptLicenceImage(e.dataTransfer.files[0]);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Driver's License Upload - TOP OF THE FORM */}
      <div className="space-y-3">
        <div className="text-center space-y-1">
          <h3 className="text-lg font-semibold text-primary">Auto-Fill: Scan Your Driver's License</h3>
          <p className="text-sm text-muted-foreground">Upload your licence to help fill in your details, then review them for accuracy.</p>
        </div>
        {declaredProClass && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm" role="status">
          <p className="font-semibold">Class {formData.licenceClass} declared — 20% pro driver discount pending verification</p>
          <p className="mt-2 text-muted-foreground">Upload a clear photo showing the class, name and licence number. At checkout we verify that it is your Alberta licence and the class matches your declaration. Autofill alone does not apply the discount.</p>
          <p className="mt-2 text-muted-foreground">No verified photo means full price at checkout. You can securely provide one afterward for the 20% partial refund if eligible.</p>
          {formData.driversLicenseImage && !proPhotoUsable && <p className="mt-2 font-medium">For discount verification, choose a JPG, PNG or WebP photo, 10 MB or smaller.</p>}
        </div>}
        {classHint !== "unknown" && formData.ticketType !== "photo_radar" && <p className="text-sm text-muted-foreground" role="status">The autofill scan suggests Class {classHint}. Your declared class has not changed. Correct it in Ticket Details if needed.</p>}
        
        <Card 
          className={cn(
            "p-6 border-2 bg-white dark:bg-white transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-primary/30"
          )}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center text-center space-y-4">
            {isProcessingOCR ? (
              <div className="space-y-4 py-8">
                <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
                <div>
                  <p className="font-medium text-foreground">Scanning your driver's license...</p>
                  <p className="text-sm text-muted-foreground">This will only take a moment</p>
                </div>
              </div>
            ) : imagePreview ? (
              <div className="space-y-4">
                <div className="relative bg-white p-4 rounded-lg">
                  <img 
                    src={imagePreview} 
                    alt="Driver's License" 
                    className="max-w-full h-48 object-contain rounded-lg border-2 border-primary/20"
                  />
                  <div className="absolute top-2 right-2 bg-primary text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Photo attached
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-primary/20">
                  <div className="flex gap-2 justify-center mb-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take New Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </Button>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {ocrSucceeded ? "Autofill complete — please review your details." : "Licence photo attached. Complete or review your details below."}
                  </p>
                  {formData.ticketType !== "photo_radar" && <p className="text-sm text-muted-foreground mt-1">
                    Attaching a photo does not confirm eligibility for the pro driver discount.
                  </p>}
                  <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => {
                    scanId.current += 1;
                    setIsProcessingOCR(false);
                    setOcrSucceeded(false);
                    setClassHint("unknown");
                    updateFormData({ driversLicenseImage: null });
                  }}>Remove photo</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mx-auto">
                  <Camera className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg text-foreground">Upload Your Driver's License</p>
                  <p className="text-sm text-muted-foreground">
                    {dragActive ? "Drop your license here" : "Drag & drop or use buttons below"}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => cameraInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Camera className="h-5 w-5" />
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="h-5 w-5" />
                    Choose File
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports JPG, PNG, WebP, HEIC and HEIF, up to 10 MB. {formData.ticketType !== "photo_radar" && "Discount verification requires JPG, PNG or WebP."}
                </p>
              </div>
            )}
            <input
              ref={cameraInputRef}
              type="file"
              accept={TICKET_CAPTURE_PHOTO_ACCEPT}
              capture="environment"
              onChange={handleImageUpload}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={TICKET_CAPTURE_PHOTO_ACCEPT}
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">Your licence photo stays out of browser storage. {formData.ticketType === "photo_radar" ? "It is used to help fill in your details." : "It is used for autofill and, where requested, secure discount verification."}</p>
      </div>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-primary/20" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-3 text-muted-foreground font-medium">Or enter manually</span>
        </div>
      </div>

      {/* Personal Details */}
      <Card className="p-6 bg-gradient-card border-2 border-primary/10">
        <h3 className="text-lg font-semibold mb-4 text-primary">Personal Details</h3>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="font-medium">First Name *</Label>
              <Input
                id="firstName"
                {...register("firstName")}
                onChange={(e) => handleFieldUpdate("firstName", e.target.value)}
                className="h-11"
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="font-medium">Last Name *</Label>
              <Input
                id="lastName"
                {...register("lastName")}
                onChange={(e) => handleFieldUpdate("lastName", e.target.value)}
                className="h-11"
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-medium">Date of Birth *</Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={dobYear} onValueChange={(value) => handleDateChange('year', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={dobMonth} onValueChange={(value) => handleDateChange('month', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={dobDay} onValueChange={(value) => handleDateChange('day', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {errors.dateOfBirth && (
                <p className="text-sm text-destructive">{errors.dateOfBirth.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="driversLicense" className="font-medium">Driver's License Number *</Label>
              <Input
                id="driversLicense"
                {...register("driversLicense")}
                onChange={(e) => handleFieldUpdate("driversLicense", e.target.value)}
                className="h-11"
              />
              {errors.driversLicense && (
                <p className="text-sm text-destructive">{errors.driversLicense.message}</p>
              )}
            </div>
          </div>
        </div>
      </Card>


      {/* Address Different From License Checkbox */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="addressDifferent"
          checked={showAddressFields}
          onCheckedChange={handleAddressDifferent}
        />
        <Label 
          htmlFor="addressDifferent" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          My current address is different from what's on my driver's license
        </Label>
      </div>

      {/* Address fields: always shown while the address is incomplete (e.g. no licence
          uploaded / OCR did not capture it), and shown on demand via the checkbox. */}
      {(showAddressFields || !(formData.address && formData.city && formData.province && formData.postalCode)) && (
        <Card className="p-6 bg-gradient-card border-2 border-primary/10">
          <h3 className="text-lg font-semibold mb-4 text-primary">Current Address</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentAddress" className="font-medium">Street Address *</Label>
            <Input
              id="currentAddress"
              {...register("address")}
              onChange={(e) => handleFieldUpdate("address", e.target.value)}
              className="transition-smooth focus:ring-2 focus:ring-primary/20"
            />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message}</p>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="currentCity">City *</Label>
              <Input
                id="currentCity"
                {...register("city")}
                onChange={(e) => handleFieldUpdate("city", e.target.value)}
                className="transition-smooth focus:ring-2 focus:ring-primary/20"
              />
              {errors.city && (
                <p className="text-sm text-destructive">{errors.city.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Province *</Label>
              <Select
                value={formData.province}
                onValueChange={(value) => handleFieldUpdate("province", value)}
              >
                <SelectTrigger className="transition-smooth focus:ring-2 focus:ring-primary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alberta">Alberta</SelectItem>
                  <SelectItem value="British Columbia">British Columbia</SelectItem>
                  <SelectItem value="Saskatchewan">Saskatchewan</SelectItem>
                  <SelectItem value="Manitoba">Manitoba</SelectItem>
                </SelectContent>
              </Select>
              {errors.province && (
                <p className="text-sm text-destructive">{errors.province.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentPostalCode">Postal Code *</Label>
              <Input
                id="currentPostalCode"
                {...register("postalCode")}
                placeholder="T2P 1J9"
                onChange={(e) => handleFieldUpdate("postalCode", e.target.value)}
                className="transition-smooth focus:ring-2 focus:ring-primary/20"
              />
              {errors.postalCode && (
                <p className="text-sm text-destructive">{errors.postalCode.message}</p>
              )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Contact Information */}
      <Card className="p-6 bg-gradient-card border-2 border-primary/10">
        <h3 className="text-lg font-semibold mb-4 text-primary">Contact Information</h3>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-medium">Email Address *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                onChange={(e) => handleFieldUpdate("email", e.target.value)}
                className="h-11"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="font-medium">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                {...register("phone")}
                placeholder="Enter your phone number"
                onChange={(e) => handleFieldUpdate("phone", e.target.value)}
                className="h-11"
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="smsOptIn"
              checked={formData.smsOptIn}
              onCheckedChange={(checked) => updateFormData({ smsOptIn: checked === true })}
            />
            <Label htmlFor="smsOptIn" className="text-sm font-normal cursor-pointer">
              Send me SMS updates about my case (recommended)
            </Label>
          </div>
        </div>
      </Card>

      <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">Privacy Note:</span> Your personal information
          is protected and used to deliver Rapid Resolution. It is shared only as authorized or needed
          for the ticket process and with service providers described in our Privacy Policy.
        </p>
      </div>
    </form>
  );
};

export default PersonalInfoStep;
