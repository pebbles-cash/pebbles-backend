import mongoose, { Schema, Document, Model } from "mongoose";

export interface Provider {
  id: string;
  type: string[];
}

export interface Currency {
  name: string;
  symbol: string;
  code: string;
}

export interface CountryConfigDocument extends Document {
  countryDisplayName: string;
  countryCode: string;
  currency: Currency;
  onrampProviders: Provider[];
  offrampProviders: Provider[];
}

const ProviderSchema = new Schema<Provider>(
  {
    id: { type: String, required: true },
    type: { type: [String], required: true },
  },
  { _id: false }
);

const CurrencySchema = new Schema<Currency>(
  {
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    code: { type: String, required: true },
  },
  { _id: false }
);

const CountryConfigSchema = new Schema<CountryConfigDocument>(
  {
    countryDisplayName: { type: String, required: true },
    countryCode: { type: String, required: true, index: true, unique: true },
    currency: { type: CurrencySchema, required: true },
    onrampProviders: { type: [ProviderSchema], required: true },
    offrampProviders: { type: [ProviderSchema], required: true },
  },
  { timestamps: true }
);

export const CountryConfig: Model<CountryConfigDocument> =
  mongoose.models.CountryConfig ||
  mongoose.model<CountryConfigDocument>("CountryConfig", CountryConfigSchema);
