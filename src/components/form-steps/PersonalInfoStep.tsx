import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Camera, Upload } from "lucide-react";
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
import { useState, useRef } from "react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onSubmit = (data: PersonalInfoSchema) => {
    updateFormData(data);
  };

  // Auto-save on blur
  const handleFieldUpdate = (field: keyof PersonalInfoSchema, value: any) => {
    setValue(field, value);
    updateFormData({ [field]: value });
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setDlImage(file);
      setImagePreview(URL.createObjectURL(file));
      updateFormData({ driversLicenseImage: file });
    }
  };

  const handleAddressDifferent = (checked: boolean) => {
    setShowAddressFields(checked);
    updateFormData({ addressDifferentFromLicense: checked });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

      {/* Driver's License Photo Upload */}
      <div className="space-y-4">
        <Label>Driver's License Photo</Label>
        <Card className="p-6 border-dashed border-2 border-primary/20 bg-primary/5">
          <div className="flex flex-col items-center text-center space-y-4">
            {imagePreview ? (
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Driver's License" 
                  className="max-w-full h-48 object-contain rounded-lg border"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Replace Photo
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Camera className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Upload Driver's License Photo</p>
                  <p className="text-sm text-muted-foreground">Take a photo or upload an image of your driver's license</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </Card>
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