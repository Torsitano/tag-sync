import { EC2Client, Instance, Tag } from '@aws-sdk/client-ec2'
import { DELETE_TAGS_FROM_INSTANCES, OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT } from './main'
import { applyTagsToResources, deleteTagsFromResources } from './tagUtils'
import * as fs from 'fs'
import { parse } from 'csv-parse/sync'
import inquirer from 'inquirer'

interface ParsedRecord {
    Identifier: string
    Service: string
    Type: string
    Region: string
    Tags: Record<string, string>
    ARN: string
}

// Applies default tags from SSM to the instances
export async function applyDefaultTagsToInstances( ec2Client: EC2Client, instances: Instance[], defaultTags: Map<string, string>, isDryRun: boolean ) {
    for ( const instance of instances ) {
        const tagsToApply: Tag[] = []
        for ( const [ key, value ] of defaultTags.entries() ) {
            const existingTag = instance.Tags?.find( tag => tag.Key === key )
            if ( !existingTag ) {
                console.log( `Adding default tag '${key}' with value '${value}' to instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: key,
                    Value: value
                } )
            } else if ( OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT && existingTag.Value !== value ) {
                console.log( `Overwriting default tag '${key}' with value '${value}' on instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: key,
                    Value: value
                } )
            }
        }
        await applyTagsToResources( {
            ec2Client,
            resourceIds: [ instance.InstanceId! ],
            tags: tagsToApply,
            isDryRun: isDryRun,
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

// Applies tags from a CSV file to the instances in the CSV file
export async function syncTagsFromCsv( ec2Client: EC2Client, instances: Instance[], csvFilePath: string, isDryRun: boolean ) {
    const parsedRecords = parseTagCsv( csvFilePath )
    if ( DELETE_TAGS_FROM_INSTANCES ) {
        const deleteTagsFromInstancesConfirmation = await inquirer.prompt( [ {
            type: 'confirm',
            name: 'deleteTagsFromInstances',
            message: 'Are you sure you want to delete tags that are not in the CSV file from Instances?'
        } ] )
        if ( deleteTagsFromInstancesConfirmation.deleteTagsFromInstances ) {
            await deleteTagsFromInstances( ec2Client, instances, parsedRecords, isDryRun )
        } else {
            console.log( 'Tags will not be deleted from instances' )
        }
    }
    await applyTagsFromCsv( ec2Client, instances, parsedRecords, isDryRun )
}

// Applies tags from a CSV file to the instances in the CSV file
export async function applyTagsFromCsv( ec2Client: EC2Client, instances: Instance[], parsedRecords: ParsedRecord[], isDryRun: boolean ) {
    for ( const record of parsedRecords ) {
        const tagsToApply: Tag[] = []
        const instance = instances.find( i => i.InstanceId === record.Identifier )
        for ( const [ key, value ] of Object.entries( record.Tags ) ) {
            const existingTag = instance?.Tags?.find( tag => tag.Key === key )
            if ( !existingTag || existingTag.Value !== value ) {
                tagsToApply.push( { Key: key, Value: value } )
            }
        }
        if ( tagsToApply.length > 0 ) {
            await applyTagsToResources( {
                ec2Client,
                resourceIds: [ record.Identifier ],
                tags: tagsToApply,
                isDryRun: isDryRun,
                resourceType: 'instance',
                resourceName: record.Identifier
            } )
        }
    }
}

// Function that will delete tags from an instance if they are not in the CSV file
export async function deleteTagsFromInstances( ec2Client: EC2Client, instances: Instance[], parsedRecords: ParsedRecord[], isDryRun: boolean ) {
    const protectedKeys = [ 'Name' ] // Add more keys if needed
    for ( const instance of instances ) {
        const tagsToDelete: Tag[] = []
        const record = parsedRecords.find( r => r.Identifier === instance.InstanceId )
        const csvTagKeys = record ? Object.keys( record.Tags ) : []
        for ( const tag of instance.Tags || [] ) {
            if ( protectedKeys.includes( tag.Key! ) ) continue
            if ( !csvTagKeys.includes( tag.Key! ) ) {
                tagsToDelete.push( tag )
            }
        }
        await deleteTagsFromResources( {
            ec2Client,
            resourceIds: [ instance.InstanceId! ],
            tags: tagsToDelete,
            isDryRun: isDryRun,
            resourceType: 'instance',
            resourceName: instance.InstanceId!
        } )
    }
}

// Parses a CSV file and returns an array of ParsedRecord objects
export function parseTagCsv( filePath: string ): ParsedRecord[] {
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
                if ( value !== '(not tagged)' && value !== '' ) {
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

