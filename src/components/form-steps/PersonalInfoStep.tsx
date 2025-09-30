import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
  const [dobYear, setDobYear] = useState<string>(formData.dateOfBirth ? formData.dateOfBirth.getFullYear().toString() : "");
  const [dobMonth, setDobMonth] = useState<string>(formData.dateOfBirth ? (formData.dateOfBirth.getMonth() + 1).toString() : "");
  const [dobDay, setDobDay] = useState<string>(formData.dateOfBirth ? formData.dateOfBirth.getDate().toString() : "");
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
    let newYear = type === 'year' ? value : dobYear;
    let newMonth = type === 'month' ? value : dobMonth;
    let newDay = type === 'day' ? value : dobDay;

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
          const date = new Date(extracted.dateOfBirth);
          handleFieldUpdate('dateOfBirth', date);
          // Update the individual date component states
          setDobYear(date.getFullYear().toString());
          setDobMonth((date.getMonth() + 1).toString());
          setDobDay(date.getDate().toString());
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Driver's License Upload - TOP OF THE FORM */}
      <div className="space-y-3">
        <div className="text-center space-y-1">
          <h3 className="text-lg font-semibold text-primary">Auto-Fill: Scan Your Driver's License</h3>
          <p className="text-sm text-muted-foreground">Skip typing - upload your license to fill all fields instantly</p>
        </div>
        
        <Card className="p-6 border-2 border-primary/30 bg-white dark:bg-white">
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
                    Scanned
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-primary/20">
                  <div className="flex gap-2 justify-center mb-2">
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
                  <p className="text-sm font-medium text-foreground">
                    Driver's license scanned successfully!
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ✨ Form fields have been auto-filled. Please review for accuracy and correct any errors.
                  </p>
                </div>
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
                onBlur={(e) => handleFieldUpdate("firstName", e.target.value)}
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
                onBlur={(e) => handleFieldUpdate("lastName", e.target.value)}
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
                onBlur={(e) => handleFieldUpdate("driversLicense", e.target.value)}
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

      {/* Conditional Address Fields */}
      {showAddressFields && (
        <Card className="p-6 bg-gradient-card border-2 border-primary/10">
          <h3 className="text-lg font-semibold mb-4 text-primary">Current Address</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentAddress" className="font-medium">Street Address *</Label>
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
                onBlur={(e) => handleFieldUpdate("email", e.target.value)}
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
                placeholder="(403) 555-0123"
                onBlur={(e) => handleFieldUpdate("phone", e.target.value)}
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
              📱 Send me SMS updates about my case (recommended)
            </Label>
          </div>
        </div>
      </Card>

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