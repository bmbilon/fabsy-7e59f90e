import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Camera, Upload, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormData } from "../TicketForm";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  const [dlImage, setDlImage] = useState<File | null>(formData.driversLicenseImage);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [showAddressFields, setShowAddressFields] = useState(formData.addressDifferentFromLicense);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [hasProcessedInitialImage, setHasProcessedInitialImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  // Process DL image on mount if it was uploaded from elsewhere
  useEffect(() => {
    if (formData.driversLicenseImage && !hasProcessedInitialImage && !formData.firstName) {
      console.log('[Mount] Processing initial DL image');
      setHasProcessedInitialImage(true);
      setDlImage(formData.driversLicenseImage);
      setImagePreview(URL.createObjectURL(formData.driversLicenseImage));
      processDLOCR(formData.driversLicenseImage);
    }
  }, [formData.driversLicenseImage]);

  const onSubmit = (data: PersonalInfoSchema) => {
    updateFormData(data);
  };

  // Auto-save on blur
  const handleFieldUpdate = (field: keyof PersonalInfoSchema, value: any) => {
    setValue(field, value);
    updateFormData({ [field]: value });
  };

  const processDLOCR = async (file: File) => {
    console.log('[DL OCR] Starting driver license OCR process with file:', file.name, file.type);
    setIsProcessingOCR(true);
    try {
      // Convert file to base64
      console.log('[DL OCR] Converting file to base64...');
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          console.log('[DL OCR] File converted to base64, length:', result.length);
          resolve(result);
        };
        reader.onerror = (error) => {
          console.error('[DL OCR] FileReader error:', error);
          reject(error);
        };
      });
      reader.readAsDataURL(file);
      const imageBase64 = await base64Promise;

      // Call OCR edge function
      console.log('[DL OCR] Calling ocr-drivers-license edge function...');
      const { data, error } = await supabase.functions.invoke('ocr-drivers-license', {
        body: { imageBase64 }
      });

      console.log('[DL OCR] Edge function response:', { data, error });

      if (error) {
        console.error('[DL OCR] Edge function error:', error);
        throw error;
      }

      if (data?.success && data?.data) {
        const extracted = data.data;
        console.log('[DL OCR] Extracted data:', extracted);
        
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
          handleFieldUpdate('dateOfBirth', new Date(extracted.dateOfBirth));
        }
        if (extracted.driversLicense) {
          handleFieldUpdate('driversLicense', extracted.driversLicense);
        }

        toast({
          title: "Driver's license scanned successfully!",
          description: "Form fields have been auto-filled. Please review and correct any errors.",
        });
      } else {
        console.warn('[DL OCR] No data returned from OCR function');
        toast({
          title: "Could not extract data",
          description: "Please fill in the form manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('[DL OCR] Error during OCR process:', error);
      toast({
        title: "Could not read driver's license",
        description: "Please fill in the form manually.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingOCR(false);
      console.log('[DL OCR] OCR process completed');
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('[DL Upload] File selected:', file?.name, file?.type, file?.size);
    if (file) {
      setDlImage(file);
      setImagePreview(URL.createObjectURL(file));
      updateFormData({ driversLicenseImage: file });
      // Trigger OCR processing
      console.log('[DL Upload] Triggering OCR...');
      processDLOCR(file);
    }
  };

  const handleAddressDifferent = (checked: boolean) => {
    setShowAddressFields(checked);
    updateFormData({ addressDifferentFromLicense: checked });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Driver's License Upload - TOP OF THE FORM */}
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-primary">Quick Start: Scan Your Driver's License</h3>
          <p className="text-sm text-muted-foreground">Upload or capture your driver's license to auto-fill all fields below</p>
        </div>
        
        <Card className="p-6 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
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
                <div className="relative">
                  <img 
                    src={imagePreview} 
                    alt="Driver's License" 
                    className="max-w-full h-48 object-contain rounded-lg border-2 border-primary/20"
                  />
                  <div className="absolute top-2 right-2 bg-primary text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Scanned
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Replace Photo
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  ✨ Fields below have been auto-filled. Please review for accuracy.
                </p>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mx-auto">
                  <Camera className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg text-foreground">Upload Your Driver's License</p>
                  <p className="text-sm text-muted-foreground">We'll automatically extract your information</p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-5 w-5" />
                  Take Photo or Upload
                </Button>
                <p className="text-xs text-muted-foreground">
                  Supports JPG, PNG, HEIC • Your data is encrypted and secure
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </Card>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-muted" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or fill manually</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            {...register("firstName")}
            onBlur={(e) => handleFieldUpdate("firstName", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
          />
          {errors.firstName && (
            <p className="text-sm text-destructive">{errors.firstName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            {...register("lastName")}
            onBlur={(e) => handleFieldUpdate("lastName", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
          />
          {errors.lastName && (
            <p className="text-sm text-destructive">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Date of Birth *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal transition-smooth focus:ring-2 focus:ring-primary/20",
                  !dateOfBirth && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateOfBirth}
                onSelect={(date) => handleFieldUpdate("dateOfBirth", date)}
                disabled={(date) =>
                  date > new Date() || date < new Date("1900-01-01")
                }
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {errors.dateOfBirth && (
            <p className="text-sm text-destructive">{errors.dateOfBirth.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="driversLicense">Driver's License Number *</Label>
          <Input
            id="driversLicense"
            {...register("driversLicense")}
            onBlur={(e) => handleFieldUpdate("driversLicense", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
          />
          {errors.driversLicense && (
            <p className="text-sm text-destructive">{errors.driversLicense.message}</p>
          )}
        </div>
      </div>


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

      {/* Conditional Address Fields */}
      {showAddressFields && (
        <div className="space-y-6 p-4 border border-primary/20 rounded-lg bg-primary/5">
          <div className="space-y-2">
            <Label className="text-primary font-medium">Current Address (if different from license)</Label>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="currentAddress">Street Address *</Label>
            <Input
              id="currentAddress"
              {...register("address")}
              onBlur={(e) => handleFieldUpdate("address", e.target.value)}
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
                onBlur={(e) => handleFieldUpdate("city", e.target.value)}
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
                onBlur={(e) => handleFieldUpdate("postalCode", e.target.value)}
                className="transition-smooth focus:ring-2 focus:ring-primary/20"
              />
              {errors.postalCode && (
                <p className="text-sm text-destructive">{errors.postalCode.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email and Phone - Manual Entry Fields at Bottom */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            onBlur={(e) => handleFieldUpdate("email", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            {...register("phone")}
            placeholder="(403) 555-0123"
            onBlur={(e) => handleFieldUpdate("phone", e.target.value)}
            className="transition-smooth focus:ring-2 focus:ring-primary/20"
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </div>
      </div>

      <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">Privacy Note:</span> Your personal information 
          is encrypted and only used for your ticket defense case. We never share your data with third parties.
        </p>
      </div>
    </form>
  );
};

export default PersonalInfoStep;