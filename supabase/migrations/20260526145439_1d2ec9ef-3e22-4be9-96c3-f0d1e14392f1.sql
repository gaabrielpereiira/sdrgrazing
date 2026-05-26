
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id bigint NOT NULL UNIQUE,
  contact_id uuid,
  status text,
  total numeric(12,2),
  currency text,
  customer_id bigint,
  customer_email text,
  customer_phone text,
  customer_name text,
  payment_method text,
  payment_method_title text,
  is_first_order boolean DEFAULT false,
  line_items jsonb DEFAULT '[]'::jsonb,
  billing jsonb DEFAULT '{}'::jsonb,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  order_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_contact_id ON public.orders(contact_id);
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_order_created_at ON public.orders(order_created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access all orders"
ON public.orders FOR ALL TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
