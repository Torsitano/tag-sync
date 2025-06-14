import { EC2Client, Instance, Tag } from '@aws-sdk/client-ec2'
import { DRY_RUN_INSTANCES, OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT } from './main'
import { applyTagsToResources } from './tagUtils'
import * as fs from 'fs'
import { parse } from 'csv-parse/sync'

interface ParsedRecord {
    Identifier: string
    Service: string
    Type: string
    Region: string
    Tags: Record<string, string>
    ARN: string
}


export async function applyDefaultTagsToInstances( ec2Client: EC2Client, instances: Instance[], defaultTags: Map<string, string> ) {
    for ( const instance of instances ) {

        const tagsToApply: Tag[] = []

        for ( const [ key, value ] of defaultTags.entries() ) {

            const existingTag = instance.Tags?.find( tag => tag.Key === key )


            if ( !existingTag ) {
                // If the tag is not on the instance, we add it to the tags to apply
                console.log( `Adding default tag '${key}' with value '${value}' to instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: key,
                    Value: value
                } )
            } else if ( OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT && existingTag.Value !== value ) {
                // If the tag is on the instance but has a different value, we overwrite it if overwrite is true
                console.log( `Overwriting default tag '${key}' with value '${value}' on instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: key,
                    Value: value
                } )
            } else {
                // If the tag is on the instance and has the same value or we are not overwriting, we skip it
                console.log( `Skipping default tag '${key}' on instance '${instance.InstanceId}' because it already exists with the same value or we are not overwriting` )
            }
        }


        await applyTagsToResources( {
            ec2Client,
            resourceIds: [ instance.InstanceId! ],
            tags: tagsToApply,
            isDryRun: DRY_RUN_INSTANCES,
            resourceType: 'instance',
            resourceName: instance.InstanceId!
        } )
    }
}

// Saves a JSON file with all the Instances and Tags
export function backupInstanceTags( instances: Instance[] ) {
    const instanceTagsBackup: Record<string, Record<string, string>> = {}

    for ( const instance of instances ) {
        const tagsObj: Record<string, string> = {}

        if ( instance.Tags ) {
            for ( const tag of instance.Tags ) {
                tagsObj[ tag.Key! ] = tag.Value!
            }
        }

        instanceTagsBackup[ instance.InstanceId! ] = tagsObj
    }

    const backupFileName = `instance-tags-backup-${new Date().toISOString()}.json`
    const backupFileContent = JSON.stringify( instanceTagsBackup, null, 2 )

    fs.writeFileSync( backupFileName, backupFileContent )
    console.log( `Instance tags backup saved to ${backupFileName}` )
}

export async function applyTagsFromCsv( ec2Client: EC2Client, csvFilePath: string ) {
    const parsedRecords = parseTagCsv( csvFilePath )

    for ( const record of parsedRecords ) {
        const tags: Tag[] = []

        for ( const [ key, value ] of Object.entries( record.Tags ) ) {
            tags.push( { Key: key, Value: value } )
        }

        await applyTagsToResources( {
            ec2Client,
            resourceIds: [ record.Identifier ],
            tags: tags,
            isDryRun: DRY_RUN_INSTANCES,
            resourceType: 'instance',
            resourceName: record.Identifier
        } )
    }
}


function parseTagCsv( filePath: string ): ParsedRecord[] {
    const fileContent = fs.readFileSync( filePath, 'utf8' )

    const records = parse( fileContent, {
        columns: true,
        skip_empty_lines: true,
    } )

    return records.map( ( record: Record<string, string> ) => {
        const tags: Record<string, string> = {}

        for ( const [ key, value ] of Object.entries( record ) ) {
            if ( key.startsWith( 'Tag: ' ) ) {
                const tagKey = key.substring( 'Tag: '.length )
                if ( value !== '(not tagged)' ) {
                    tags[ tagKey ] = value
                }
            }
        }

        return {
            Identifier: record[ 'Identifier' ],
            Service: record[ 'Service' ],
            Type: record[ 'Type' ],
            Region: record[ 'Region' ],
            Tags: tags,
            ARN: record[ 'ARN' ],
        }
    } )
}