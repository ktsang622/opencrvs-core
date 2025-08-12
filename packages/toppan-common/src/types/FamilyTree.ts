export interface Node {
  id: string;
  full_name: string;
  dob: string;
  death?: string;
  age: string;
  id_type_1?: string;
  id_1?: string;
  id_type_2?: string;
  id_2?: string;
  id_type_3?: string;
  id_3?: string;
  level: number;
  end_date?: string;
}

export interface Link {
  from: string;
  to: string;
  relationship: string;
  start_date?: string;
  end_date?: string;
}