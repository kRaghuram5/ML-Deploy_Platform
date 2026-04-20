import re
import sys

def process_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    out = []
    in_block = False
    eof_marker = ""
    for line in lines:
        if not in_block:
            m = re.search(r"<< '([A-Z_]+)'", line)
            if m:
                in_block = True
                eof_marker = m.group(1)
            out.append(line)
        else:
            if line.strip() == eof_marker:
                in_block = False
                out.append("            " + line)
            else:
                out.append("            " + line)
                
    with open(filepath, 'w') as f:
        f.writelines(out)

process_file("ai-autoscale-hackathon/k8s-manifests/load-generator-job.yaml")
